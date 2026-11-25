// Built at release time; no scripts, network, persistence or key logging.
// The mouse hook only consumes middle-button down/up for drawing inside the
// selected source. IPC output runs on a worker, never inside the global hook.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class ScreenDrawing : Form {
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public POINT Point; public uint MouseData, Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int Width, Height; }
  [StructLayout(LayoutKind.Sequential, Pack=1)] struct BLEND { public byte Operation, Flags, Alpha, Format; }
  [StructLayout(LayoutKind.Sequential)] struct BITMAPINFO { public uint Size; public int Width, Height; public ushort Planes, Bits; public uint Compression, ImageBytes; public int XPixels, YPixels; public uint Colors, Important; }
  delegate IntPtr Hook(int code, IntPtr message, IntPtr value);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr value);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rectangle);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out RECT rectangle, int size);
  [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr window, uint affinity);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
  [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr window, IntPtr target, ref POINT destination, ref SIZE size, IntPtr source, ref POINT origin, uint key, ref BLEND blend, uint flags);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFO info, uint usage, out IntPtr bits, IntPtr section, uint offset);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr value);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  readonly List<Stroke> strokes = new List<Stroke>();
  readonly Queue<object> output = new Queue<object>();
  readonly AutoResetEvent outputReady = new AutoResetEvent(false);
  readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 16 };
  readonly Hook callback;
  readonly JavaScriptSerializer json = new JavaScriptSerializer();
  IntPtr hook, sourceWindow;
  Rectangle sourceRect;
  Stroke active;
  bool exiting, gesture;
  IntPtr surfaceDC, surfaceBitmap, previousBitmap;
  Bitmap surface;
  Graphics graphics;
  class Stroke { public string Id; public readonly List<PointF> Points = new List<PointF>(); public readonly List<double[]> Pending = new List<double[]>(); public long Started, Ended; }
  static long Now() { return (DateTime.UtcNow.Ticks - 621355968000000000L) / 10000; }
  ScreenDrawing(string[] args) {
    if (args.Length < 2 || args[0] != "--source") throw new ArgumentException("A selected capture source is required.");
    string[] source = args[1].Split(':'); long handle;
    if (source.Length != 3 || !long.TryParse(source[1], out handle)) throw new ArgumentException("Invalid source.");
    if (source[0] == "window") { sourceWindow = new IntPtr(handle); if (!BoundsForSource()) throw new ArgumentException("The selected window is unavailable."); }
    else if (source[0] == "screen" && args.Length == 4 && args[2] == "--rect") {
      string[] values = args[3].Split(','); if (values.Length != 4) throw new ArgumentException("Invalid display.");
      sourceRect = new Rectangle(int.Parse(values[0]), int.Parse(values[1]), int.Parse(values[2]), int.Parse(values[3]));
      if (sourceRect.Width <= 0 || sourceRect.Height <= 0) throw new ArgumentException("Invalid display size.");
    } else throw new ArgumentException("Invalid capture source.");
    FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true;
    StartPosition = FormStartPosition.Manual; Bounds = SystemInformation.VirtualScreen;
    // Per-pixel alpha avoids color-key fringes around the black outline and
    // allows the appear/disappear animation to fade smoothly into transparency.
    SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true);
    callback = OnMouse;
    timer.Tick += delegate { Frame(); };
    new Thread(WriteOutput) { IsBackground = true, Name = "Chat drawing output" }.Start();
    new Thread(delegate() { try { while (Console.In.ReadLine() != null) {} } catch {} finally { if (!exiting) BeginInvoke(new Action(Close)); } }) { IsBackground = true, Name = "Chat drawing lifetime" }.Start();
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080 | 0x00000020 | 0x00080000; return cp; } }
  protected override void OnShown(EventArgs e) {
    base.OnShown(e);
    // Never let the 20%-opacity private preview leak into the captured pixels.
    // Windows 10 2004+ implements this as exclusion, older Windows is unsupported.
    if (!SetWindowDisplayAffinity(Handle, 0x11)) { Console.Error.WriteLine("Windows could not exclude the drawing preview from screen capture."); Close(); return; }
    hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) { Console.Error.WriteLine("Windows could not start the drawing input hook."); Close(); return; }
    Enqueue(new { ready = true });
  }
  bool BoundsForSource() {
    if (sourceWindow == IntPtr.Zero) return sourceRect.Width > 0 && sourceRect.Height > 0;
    if (!IsWindow(sourceWindow) || IsIconic(sourceWindow)) return false;
    RECT rect; if (DwmGetWindowAttribute(sourceWindow, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(sourceWindow, out rect)) return false;
    sourceRect = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom); return sourceRect.Width > 0 && sourceRect.Height > 0;
  }
  void Enqueue(object value) { lock (output) { if (output.Count < 512) output.Enqueue(value); } outputReady.Set(); }
  void WriteOutput() { try { while (!exiting) { outputReady.WaitOne(); for (;;) { object value; lock (output) { if (output.Count == 0) break; value = output.Dequeue(); } Console.Out.WriteLine(json.Serialize(value)); Console.Out.Flush(); } } } catch { if (!exiting) BeginInvoke(new Action(Close)); } }
  void Send(Stroke stroke, string phase) { Enqueue(new { id = stroke.Id, phase = phase, points = stroke.Pending.ToArray(), at = Now() }); stroke.Pending.Clear(); }
  void AddPoint(POINT point) {
    if (active == null || !BoundsForSource()) return;
    float x = Math.Max(0, Math.Min(1, (float)(point.X - sourceRect.X) / sourceRect.Width)), y = Math.Max(0, Math.Min(1, (float)(point.Y - sourceRect.Y) / sourceRect.Height));
    PointF pixel = new PointF(sourceRect.X + x * sourceRect.Width, sourceRect.Y + y * sourceRect.Height);
    if (active.Points.Count > 0) { var last = active.Points[active.Points.Count - 1]; if (Math.Abs(last.X - pixel.X) + Math.Abs(last.Y - pixel.Y) < 1.2f) return; }
    if (active.Points.Count >= 12000) return;
    active.Points.Add(pixel); active.Pending.Add(new double[] { x, y });
  }
  void Finish() { if (active == null) return; active.Ended = Now(); Send(active, "end"); active = null; }
  IntPtr OnMouse(int code, IntPtr message, IntPtr value) {
    if (code < 0 || exiting) return CallNextHookEx(hook, code, message, value);
    int kind = message.ToInt32();
    if (kind != 0x200 && kind != 0x207 && kind != 0x208) return CallNextHookEx(hook, code, message, value);
    var mouse = (MOUSE)Marshal.PtrToStructure(value, typeof(MOUSE));
    // Consume the down/up pair so browsers never receive the middle-button
    // autoscroll trigger. This is hold-to-draw, never a click-to-toggle mode.
    if (kind == 0x207 && BoundsForSource() && sourceRect.Contains(mouse.Point.X, mouse.Point.Y)) {
      Finish(); gesture = true; active = new Stroke { Id = Guid.NewGuid().ToString("N"), Started = Now() }; strokes.Add(active); AddPoint(mouse.Point); Send(active, "start"); timer.Start(); return new IntPtr(1);
    }
    if (gesture) {
      // Passing movement onward keeps the real Windows pointer moving. The
      // underlying application never received the initiating middle down, so
      // native browser autoscroll remains off without swallowing pointer moves.
      if (kind == 0x200) { AddPoint(mouse.Point); return CallNextHookEx(hook, code, message, value); }
      if (kind == 0x208) { AddPoint(mouse.Point); Finish(); gesture = false; return new IntPtr(1); }
    }
    return CallNextHookEx(hook, code, message, value);
  }
  void Frame() {
    if (active != null && active.Pending.Count > 0) Send(active, "points");
    long now = Now(); strokes.RemoveAll(s => s.Ended > 0 && now - s.Ended >= 3000);
    PaintLayer(); if (strokes.Count == 0) timer.Stop();
  }
  void ReleaseSurface() {
    if (graphics != null) { graphics.Dispose(); graphics = null; }
    if (surface != null) { surface.Dispose(); surface = null; }
    if (surfaceDC != IntPtr.Zero) { SelectObject(surfaceDC, previousBitmap); DeleteObject(surfaceBitmap); DeleteDC(surfaceDC); surfaceDC = IntPtr.Zero; }
  }
  void PaintLayer() {
    // Reuse a tightly bounded DIB. Rounding to tiles avoids allocating a new
    // surface for every mouse point; idle sharing has no paint timer at all.
    float left = float.MaxValue, top = float.MaxValue, right = float.MinValue, bottom = float.MinValue;
    foreach (var s in strokes) foreach (var p in s.Points) { left = Math.Min(left, p.X); top = Math.Min(top, p.Y); right = Math.Max(right, p.X); bottom = Math.Max(bottom, p.Y); }
    int x = strokes.Count > 0 ? (int)Math.Floor((left - 8) / 128) * 128 : 0, y = strokes.Count > 0 ? (int)Math.Floor((top - 8) / 128) * 128 : 0;
    int width = strokes.Count > 0 ? Math.Max(128, (int)Math.Ceiling((right + 8 - x) / 128) * 128) : 1, height = strokes.Count > 0 ? Math.Max(128, (int)Math.Ceiling((bottom + 8 - y) / 128) * 128) : 1;
    if (surface == null || surface.Width != width || surface.Height != height) {
      ReleaseSurface(); IntPtr desktop = GetDC(IntPtr.Zero), bits;
      surfaceDC = CreateCompatibleDC(desktop);
      var info = new BITMAPINFO { Size = (uint)Marshal.SizeOf(typeof(BITMAPINFO)), Width = width, Height = -height, Planes = 1, Bits = 32 };
      surfaceBitmap = CreateDIBSection(desktop, ref info, 0, out bits, IntPtr.Zero, 0); ReleaseDC(IntPtr.Zero, desktop);
      if (surfaceBitmap == IntPtr.Zero || bits == IntPtr.Zero) { Close(); return; }
      previousBitmap = SelectObject(surfaceDC, surfaceBitmap); surface = new Bitmap(width, height, width * 4, PixelFormat.Format32bppPArgb, bits); graphics = Graphics.FromImage(surface);
    }
    graphics.ResetTransform(); graphics.Clear(Color.Transparent); graphics.SmoothingMode = SmoothingMode.AntiAlias; graphics.TranslateTransform(-x, -y);
    long now = Now();
    foreach (var stroke in strokes) {
      float opacity = Math.Min(1, (now - stroke.Started) / 90f); if (stroke.Ended > 0) opacity *= Math.Min(1, Math.Max(0, (3000 - now + stroke.Ended) / 180f));
      int alpha = (int)(255 * opacity); if (alpha <= 0 || stroke.Points.Count == 0) continue;
      using (var outline = new Pen(Color.FromArgb(alpha, 12, 12, 14), 4)) using (var red = new Pen(Color.FromArgb(alpha, 255, 54, 64), 2.2f)) {
        outline.StartCap = outline.EndCap = red.StartCap = red.EndCap = LineCap.Round; outline.LineJoin = red.LineJoin = LineJoin.Round;
        if (stroke.Points.Count > 1) { var points = stroke.Points.ToArray(); graphics.DrawLines(outline, points); graphics.DrawLines(red, points); }
        else { var point = stroke.Points[0]; graphics.DrawLine(outline, point.X, point.Y, point.X + .2f, point.Y); graphics.DrawLine(red, point.X, point.Y, point.X + .2f, point.Y); }
      }
    }
    var destination = new POINT { X = x, Y = y }; var origin = new POINT(); var size = new SIZE { Width = width, Height = height }; var blend = new BLEND { Operation = 0, Alpha = 51, Format = 1 };
    UpdateLayeredWindow(Handle, IntPtr.Zero, ref destination, ref size, surfaceDC, ref origin, 0, ref blend, 2);
  }
  protected override void OnPaint(PaintEventArgs e) {}
  protected override void OnPaintBackground(PaintEventArgs e) {}
  protected override void OnFormClosed(FormClosedEventArgs e) { exiting = true; timer.Stop(); timer.Dispose(); if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook); ReleaseSurface(); outputReady.Set(); base.OnFormClosed(e); }
  [STAThread] static int Main(string[] args) {
    try { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { SetProcessDPIAware(); } Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new ScreenDrawing(args)); return 0; }
    catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
  }
}
