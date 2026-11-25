using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// Receives only desktop foreground changes through the Windows accessibility
// event stream. No input hook, process enumeration or window titles are used.
internal static class DesktopPresentation {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Bounds, Work; public int Flags; }
    delegate void ForegroundChanged(IntPtr hook, uint type, IntPtr window, int obj, int child, uint thread, uint time);
    static readonly ForegroundChanged onForeground = Changed;
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, ForegroundChanged callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr handle);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    static void Changed(IntPtr hook, uint type, IntPtr window, int obj, int child, uint thread, uint time) {
        if (window == IntPtr.Zero) return;
        MonitorInfo info = new MonitorInfo(); info.Size = Marshal.SizeOf(typeof(MonitorInfo));
        if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref info)) return;
        try {
            Console.WriteLine("{0} {1} {2}", window.ToInt64(), (info.Bounds.Left + info.Bounds.Right) / 2, (info.Bounds.Top + info.Bounds.Bottom) / 2);
        } catch (System.IO.IOException) { Application.ExitThread(); }
    }
    [STAThread] static int Main(string[] args) {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) {}
        if (args.Length == 3 && args[0] == "--hit-test" && Environment.GetEnvironmentVariable("CHAT_APP_NOTIFICATION_SELFTEST") == "1" &&
            Environment.GetEnvironmentVariable("CHAT_APP_OFFLINE") == "1" && System.IO.Path.IsPathRooted(Environment.GetEnvironmentVariable("CHAT_APP_TEST_PROFILE") ?? "")) {
            int x, y;
            if (!int.TryParse(args[1], out x) || !int.TryParse(args[2], out y)) return 2;
            Console.WriteLine(GetAncestor(WindowFromPoint(new Point { X=x, Y=y }), 2).ToInt64().ToString(CultureInfo.InvariantCulture));
            return 0;
        }
        if (args.Length != 1 || args[0] != "--foreground") return 2;
        IntPtr handle = SetWinEventHook(3, 3, IntPtr.Zero, onForeground, 0, 0, 0);
        if (handle == IntPtr.Zero) return 1;
        // EOF is guaranteed even when the host is terminated mid-call.
        var input = new Thread(() => { try { while (Console.ReadLine() != null) {} } finally { Environment.Exit(0); } });
        input.IsBackground = true; input.Start();
        Changed(handle, 3, GetForegroundWindow(), 0, 0, 0, 0);
        try { Application.Run(); } finally { UnhookWinEvent(handle); }
        return 0;
    }
}
