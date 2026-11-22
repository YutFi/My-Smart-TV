param([string]$Name = 'Nebula', [int]$Seconds = 40)
# Makes the main window of a desktop program as close to full screen as the program allows:
# borderless, sized to the monitor it is on, and above the taskbar. Programs with a fixed window size (like the Nebula
# launcher) keep their size and are simply centred. Only the named process's window is touched.
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FsWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int ht, uint f);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
  public static IntPtr Find(uint[] pids) {
    IntPtr best = IntPtr.Zero; long area = 0;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint p; GetWindowThreadProcessId(h, out p);
      if (Array.IndexOf(pids, p) < 0) return true;
      if (GetWindowTextLength(h) == 0) return true;
      RECT r; GetWindowRect(h, out r);
      long a = (long)(r.R - r.L) * (r.B - r.T);
      if (a > area) { area = a; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static string Rect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r.L + "," + r.T + "," + (r.R - r.L) + "," + (r.B - r.T); }
  public static void Go(IntPtr h, int x, int y, int w, int ht) {
    if (IsIconic(h)) ShowWindow(h, 9);
    int s = GetWindowLong(h, -16);
    s &= ~(0x00C00000 | 0x00040000 | 0x00020000 | 0x00010000 | 0x00080000); // caption, thick frame, max/min box, sysmenu
    SetWindowLong(h, -16, s);
    SetWindowPos(h, IntPtr.Zero, x, y, w, ht, 0x0020 | 0x0040 | 0x0004);     // frame changed, show, keep z-order
    RECT r; GetWindowRect(h, out r);
    int aw = r.R - r.L;
    if (aw < w) {                                                             // fixed-size window: centre it horizontally
      SetWindowPos(h, IntPtr.Zero, x + (w - aw) / 2, y, 0, 0, 0x0001 | 0x0004 | 0x0040);
    }
    SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);   // topmost: above the taskbar
    SetForegroundWindow(h);
  }
}
"@
[void][FsWin]::SetProcessDPIAware()   # work in real pixels so sizes match the monitor exactly
Add-Type -AssemblyName System.Windows.Forms
$deadline = (Get-Date).AddSeconds($Seconds)
$done = 0
$last = ''
while ((Get-Date) -lt $deadline) {
  $pids = @(Get-Process -Name $Name -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
  if ($pids.Count -gt 0) {
    $h = [FsWin]::Find($pids)
    if ($h -ne [IntPtr]::Zero) {
      $cur = [FsWin]::Rect($h)
      if ($cur -ne $last) {
        $b = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
        [FsWin]::Go($h, $b.X, $b.Y, $b.Width, $b.Height)
        $last = [FsWin]::Rect($h); $done++
      }
    }
  }
  Start-Sleep -Milliseconds 1500
}
"applied $done"
