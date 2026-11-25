// Test-only entry point compiled alongside the unchanged shipping source.
// Injects data by reflection; never injects mouse/keyboard input or shows UI.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class TestHarness {
  const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
  static readonly Type Target = typeof(ScreenDrawing);
  static readonly List<string> Checks = new List<string>();
  static readonly ManualResetEvent InputRelease = new ManualResetEvent(false);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr handle, int index);
  sealed class WaitingReader : TextReader { public override string ReadLine() { InputRelease.WaitOne(); return null; } }
  static object Get(object obj, string name) { return Target.GetField(name, Private).GetValue(obj); }
  static object Call(object obj, string name, params object[] args) { return Target.GetMethod(name, Private).Invoke(obj, args); }
  static long Now() { return (DateTime.UtcNow.Ticks - 621355968000000000L) / 10000; }
  static void Check(bool condition, string message) { if (!condition) throw new Exception(message); Checks.Add(message); }
  static object Stroke(long started, long ended, params PointF[] points) {
    var type = Target.GetNestedType("Stroke", BindingFlags.NonPublic);
    var value = Activator.CreateInstance(type, true);
    type.GetField("Id").SetValue(value, "test-stroke"); type.GetField("Started").SetValue(value, started); type.GetField("Ended").SetValue(value, ended);
    var list = (IList)type.GetField("Points").GetValue(value); foreach (var point in points) list.Add(point); return value;
  }
  static void SetStrokeTime(object stroke, string name, long value) { stroke.GetType().GetField(name).SetValue(stroke, value); }
  static IntPtr Mouse(Form form, int message, int x, int y) {
    // Call the hook's pure message-handling path with a private structure. This
    // never injects input into Windows or another application.
    var pointType = Target.GetNestedType("POINT", BindingFlags.NonPublic); var point = Activator.CreateInstance(pointType);
    pointType.GetField("X").SetValue(point, x); pointType.GetField("Y").SetValue(point, y);
    var mouseType = Target.GetNestedType("MOUSE", BindingFlags.NonPublic); var mouse = Activator.CreateInstance(mouseType); mouseType.GetField("Point").SetValue(mouse, point);
    IntPtr buffer = Marshal.AllocHGlobal(Marshal.SizeOf(mouseType));
    try { Marshal.StructureToPtr(mouse, buffer, false); return (IntPtr)Call(form, "OnMouse", 0, new IntPtr(message), buffer); }
    finally { Marshal.FreeHGlobal(buffer); }
  }
  [STAThread] static int Main(string[] args) {
    Form form = null;
    try {
      Console.SetIn(new WaitingReader()); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
      form = (Form)Activator.CreateInstance(Target, Private, null, new object[] { new string[] { "--source", "screen:0:0", "--rect", "0,0,1280,720" } }, null);
      IntPtr handle = form.Handle; // Creates a hidden native surface; OnShown/hook never runs.
      long styles = GetWindowLongPtr(handle, -20).ToInt64();
      Check((styles & 0x08080020) == 0x08080020, "hidden surface is layered, click-through and nonactivating");
      Check((IntPtr)Get(form, "hook") == IntPtr.Zero, "render harness installs no global input hook");
      var list = (IList)Get(form, "strokes");
      Mouse(form, 0x201, 50, 50); Check(list.Count == 0 && !(bool)Get(form, "gesture"), "left button never starts drawing and no Alt key is required");
      Mouse(form, 0x207, -50, -50); Check(list.Count == 0 && !(bool)Get(form, "gesture"), "middle button outside the shared source does not capture input");
      Check(Mouse(form, 0x207, 50, 50) == new IntPtr(1) && (bool)Get(form, "gesture"), "middle down starts a held gesture and consumes the browser autoscroll trigger");
      var held = Get(form, "active");
      Check(Mouse(form, 0x200, 100, 60) == IntPtr.Zero && ((IList)held.GetType().GetField("Points").GetValue(held)).Count == 2, "movement while holding middle records points and passes through to keep the Windows pointer moving");
      Check(Mouse(form, 0x208, 110, 60) == new IntPtr(1) && !(bool)Get(form, "gesture") && Get(form, "active") == null, "middle up ends drawing and is consumed before the underlying website");
      int heldPoints = ((IList)held.GetType().GetField("Points").GetValue(held)).Count;
      Mouse(form, 0x200, 150, 60); Check(((IList)held.GetType().GetField("Points").GetValue(held)).Count == heldPoints, "movement after release never continues drawing");
      Mouse(form, 0x207, 60, 60); Mouse(form, 0x208, 60, 60); Mouse(form, 0x200, 160, 60);
      Check(Get(form, "active") == null && !(bool)Get(form, "gesture"), "a single middle click never toggles persistent drawing mode");
      list.Clear(); ((System.Windows.Forms.Timer)Get(form, "timer")).Stop();
      var stroke = Stroke(Now() - 500, 0, new PointF(20, 30), new PointF(120, 30), new PointF(120, 60)); list.Add(stroke);
      Call(form, "PaintLayer"); var bitmap = (Bitmap)Get(form, "surface");
      Check(bitmap.Width == 128 && bitmap.Height == 128 && bitmap.PixelFormat == PixelFormat.Format32bppPArgb, "stroke allocates a bounded premultiplied-alpha DIB");
      Color red = bitmap.GetPixel(60, 30); Check(red.A >= 250 && red.R >= 240 && red.G < 90 && red.B < 100, "stroke center renders solid red");
      bool outline = false; for (int y = 27; y <= 33; y++) { Color c = bitmap.GetPixel(60, y); if (c.A > 0 && c.R < 60 && c.G < 60 && c.B < 60) outline = true; }
      Check(outline, "thin black outline surrounds the red center"); Check(bitmap.GetPixel(2, 2).A == 0, "unused pixels stay fully transparent without color-key fringes");
      RECT bounds; Check(GetWindowRect(handle, out bounds) && bounds.Left == 0 && bounds.Top == 0 && bounds.Right == 128 && bounds.Bottom == 128, "UpdateLayeredWindow positions the native surface at the rendered tile");
      if (args.Length > 0) bitmap.Save(args[0], ImageFormat.Png);
      IntPtr firstDib = (IntPtr)Get(form, "surfaceBitmap"); Call(form, "PaintLayer"); Check((IntPtr)Get(form, "surfaceBitmap") == firstDib, "successive frames reuse the same DIB allocation");
      SetStrokeTime(stroke, "Started", Now() - 35); Call(form, "PaintLayer"); int appearingAlpha = ((Bitmap)Get(form, "surface")).GetPixel(60, 30).A;
      Check(appearingAlpha > 0 && appearingAlpha < 245, "appearance animates through partial alpha");
      SetStrokeTime(stroke, "Started", Now() - 500); SetStrokeTime(stroke, "Ended", Now() - 2910); Call(form, "PaintLayer"); int fadingAlpha = ((Bitmap)Get(form, "surface")).GetPixel(60, 30).A;
      Check(fadingAlpha > 0 && fadingAlpha < 245, "final 180ms animate disappearance through partial alpha");
      SetStrokeTime(stroke, "Ended", Now() - 3100); Call(form, "Frame"); bitmap = (Bitmap)Get(form, "surface");
      Check(list.Count == 0 && bitmap.Width == 1 && bitmap.Height == 1 && bitmap.GetPixel(0, 0).A == 0, "three-second expiry removes stroke and clears its native pixels");
      Check(!((System.Windows.Forms.Timer)Get(form, "timer")).Enabled, "idle overlay stops its frame timer");
      var negative = Stroke(Now() - 500, 0, new PointF(-120, -70), new PointF(-10, -70)); list.Add(negative); Call(form, "PaintLayer");
      bitmap = (Bitmap)Get(form, "surface"); Color shifted = bitmap.GetPixel(60, 58);
      Check(shifted.R >= 240 && shifted.A >= 250 && GetWindowRect(handle, out bounds) && bounds.Left == -128 && bounds.Top == -128, "negative monitor coordinates render at the correct translated position");
      SetStrokeTime(negative, "Started", Now() - 10000); Call(form, "Frame"); Check(list.Count == 1, "an active long gesture remains until release");
      Target.GetField("active", Private).SetValue(form, negative); Call(form, "Finish");
      Check(Get(form, "active") == null && (long)negative.GetType().GetField("Ended").GetValue(negative) > 0, "releasing a gesture starts its expiry without manual clearing");
      Call(form, "OnFormClosed", new FormClosedEventArgs(CloseReason.ApplicationExitCall));
      Check((bool)Get(form, "exiting") && Get(form, "surface") == null && (IntPtr)Get(form, "surfaceDC") == IntPtr.Zero, "stop disposes the bitmap, graphics and native device context");
      form.Dispose(); form = null; InputRelease.Set();
      Console.WriteLine(new JavaScriptSerializer().Serialize(new { passed = true, checks = Checks })); return 0;
    } catch (Exception error) { Console.Error.WriteLine((error.InnerException ?? error).ToString()); return 1; }
    finally { if (form != null) { try { Call(form, "OnFormClosed", new FormClosedEventArgs(CloseReason.ApplicationExitCall)); form.Dispose(); } catch {} } InputRelease.Set(); }
  }
}
