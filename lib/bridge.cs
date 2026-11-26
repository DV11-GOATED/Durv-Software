// Durv Software input bridge. Compiled by PowerShell's Add-Type (C# 5 only: no ?. , no $"" , no out var).
// ONE long-running process reads XInput for every pad, runs the global combos, drives the virtual mouse, and talks to
// the Electron main process over stdin / stdout (one line per message). Nothing is spawned per poll.
//
// stdout (events):   READY | RETURN | OVERLAY | MOUSE_TOGGLE | KEYBOARD | SWITCH_START | SWITCH_END | NAV <name>
// Combos: hold L2+R2+L3+R3 = task switcher | hold L1+R1+L3+R3 = back to Durv Software | hold Select+Start = overlay | Select+LB = mouse.
// stdin  (commands): MODE idle|mouse|nav | SHELL <hwnd> | FOCUS <hwnd> | SAVEFG | RESTOREFG | TYPE <base64 utf8> |
//                    KEY bksp|enter|esc|tab | SWITCH | QUIT
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public struct PadState
{
    public bool Connected;
    public int Buttons;            // XInput button bits
    public int LT, RT;             // 0..255
    public int LX, LY, RX, RY;     // -32768..32767
}

public interface ISink
{
    void Emit(string line);                 // event to Electron
    void MoveBy(int dx, int dy);            // move the Windows cursor
    void Wheel(int delta);                  // 120 = one notch, positive = up
    void MouseButton(int which, bool down); // 0 = left, 1 = right
    void Key(int vk, bool down);
    int ForegroundPid();
    void TakeShell();
    int ScreenWidth();
}

// All the decisions live here (no Windows calls), so they can be unit-tested with simulated pad input.
public class Core
{
    public const int DPAD_UP = 0x0001, DPAD_DOWN = 0x0002, DPAD_LEFT = 0x0004, DPAD_RIGHT = 0x0008;
    public const int START = 0x0010, BACK = 0x0020, LB = 0x0100, RB = 0x0200;
    public const int THUMB_L = 0x0040, THUMB_R = 0x0080;           // L3 / R3 (stick clicks)
    public const int BTN_A = 0x1000, BTN_B = 0x2000, BTN_X = 0x4000, BTN_Y = 0x8000;
    public const int VK_TAB = 0x09, VK_ESC = 0x1B, VK_LSHIFT = 0xA0, VK_LMENU = 0xA4;

    const int TRIG_ON = 170, TRIG_OFF = 110;
    const double STICK_DZ = 0.20;

    readonly ISink s;
    readonly int appPid, returnHold, comboHold;
    readonly long switchHold;              // L2 + R2 + L3 + R3 must be down this long (ms) to open the switcher
    string mode = "idle";
    public string Mode { get { return mode; } }

    int prevB; long last;
    bool ltOn, rtOn, homeWas;
    long swSince = -1; bool swFired;
    long homeSince; bool homeFired;
    long cooldownUntil;
    long ssSince = -1; bool ssFired;
    bool selChord, startChord;
    bool swallow;

    bool swActive; long swLast;

    bool leftDown, rightDown;
    double accX, accY, wheelAcc, dpadHold;

    readonly bool[] repWas = new bool[6];
    readonly long[] repNext = new long[6];
    static readonly string[] RepNames = { "up", "down", "left", "right", "lb", "rb" };

    public Core(ISink sink, int appPid, int returnHoldMs, int comboHoldMs, int switcherHoldMs = 500)
    {
        s = sink; this.appPid = appPid;
        switchHold = switcherHoldMs < 100 ? 500 : switcherHoldMs;
        returnHold = returnHoldMs < 200 ? 700 : returnHoldMs;
        comboHold = comboHoldMs < 100 ? 300 : comboHoldMs;
    }

    static double Norm(int v) { double d = v / 32767.0; return d > 1 ? 1 : d < -1 ? -1 : d; }

    public void SetMode(string m)
    {
        if (m != "idle" && m != "mouse" && m != "nav") return;
        if (m == mode) return;
        ReleaseMouse();
        mode = m;
        swallow = true;                      // ignore whatever is already held when the mode changes
        for (int i = 0; i < repWas.Length; i++) repWas[i] = false;
        accX = accY = wheelAcc = dpadHold = 0;
    }

    void ReleaseMouse()
    {
        if (leftDown) { s.MouseButton(0, false); leftDown = false; }
        if (rightDown) { s.MouseButton(1, false); rightDown = false; }
    }

    // Everything held down (Alt for the task switcher, mouse buttons) is let go. Call before exiting.
    public void Shutdown()
    {
        ReleaseMouse();
        if (swActive) { s.Key(VK_LMENU, false); swActive = false; }
    }

    void TapKey(int vk) { s.Key(vk, true); s.Key(vk, false); }
    void Tab(bool back)
    {
        if (back) s.Key(VK_LSHIFT, true);
        TapKey(VK_TAB);
        if (back) s.Key(VK_LSHIFT, false);
    }

    public void StartSwitcher(long now)
    {
        if (swActive) return;
        ReleaseMouse();
        swActive = true; swLast = now;
        s.Key(VK_LMENU, true);               // Alt stays down: that is what keeps the Alt+Tab switcher on screen
        TapKey(VK_TAB);
        s.Emit("SWITCH_START");
    }

    void EndSwitcher(bool cancel, long now)
    {
        if (!swActive) return;
        if (cancel) TapKey(VK_ESC);
        s.Key(VK_LMENU, false);
        swActive = false;
        cooldownUntil = now + 500;
        swallow = true;
        s.Emit("SWITCH_END");
    }

    public void Tick(PadState p, long now)
    {
        long dtl = last == 0 ? 16 : now - last;
        last = now;
        double dt = dtl < 1 ? 1 : dtl > 100 ? 100 : dtl;

        if (!p.Connected)
        {
            ReleaseMouse();
            if (swActive) EndSwitcher(false, now);
            prevB = 0; ltOn = rtOn = homeWas = false; swSince = -1; swFired = false; ssSince = -1; ssFired = false;
            return;
        }

        int b = p.Buttons;
        int pressed = b & ~prevB, released = ~b & prevB;
        prevB = b;
        ltOn = ltOn ? p.LT > TRIG_OFF : p.LT > TRIG_ON;
        rtOn = rtOn ? p.RT > TRIG_OFF : p.RT > TRIG_ON;
        bool selHeld = (b & BACK) != 0;

        // ---- Select + Start, held: overlay ----
        bool ss = selHeld && (b & START) != 0;
        if (ss)
        {
            selChord = true; startChord = true;
            if (ssSince < 0) ssSince = now;
            if (!ssFired && now - ssSince >= comboHold && !swActive) { ssFired = true; s.Emit("OVERLAY"); }
        }
        else { ssSince = -1; ssFired = false; }

        // ---- Select + LB: virtual mouse on/off ----
        if (selHeld && (b & LB) != 0 && (pressed & (BACK | LB)) != 0 && !swActive)
        {
            selChord = true;
            s.Emit("MOUSE_TOGGLE");
        }

        // L1+R1+L3+R3 = home, L2+R2+L3+R3 = switcher. They share L3+R3, so each one requires the other's pair to be UP:
        // pressing all six opens neither.
        const int HOME_COMBO = LB | RB | THUMB_L | THUMB_R;
        const int STICKS = THUMB_L | THUMB_R;
        bool homeHeld = (b & HOME_COMBO) == HOME_COMBO && !ltOn && !rtOn;

        // ---- L2 + R2 + L3 + R3 held together: Alt+Tab style switcher ----
        bool swHeld = ltOn && rtOn && (b & STICKS) == STICKS && (b & (LB | RB)) == 0;
        bool swEdge = false;
        if (swHeld)
        {
            if (swSince < 0) swSince = now;
            if (!swFired && now - swSince >= switchHold) { swFired = true; swEdge = true; }
        }
        else { swSince = -1; swFired = false; }

        // ---- hold L1 + R1 + L3 + R3 together: back to Durv Software ----
        if (homeHeld && !homeWas) { homeSince = now; homeFired = false; }
        if (homeHeld && !homeFired && !swActive && now - homeSince >= returnHold && now >= cooldownUntil)
        {
            homeFired = true;
            cooldownUntil = now + 1200;
            if (s.ForegroundPid() != appPid) { s.TakeShell(); s.Emit("RETURN"); }
        }
        homeWas = homeHeld;

        // ---- switcher is open: it owns the pad ----
        if (swActive)
        {
            bool did = false;
            if ((pressed & (RB | DPAD_RIGHT | DPAD_DOWN)) != 0) { Tab(false); did = true; }
            else if ((pressed & (LB | DPAD_LEFT | DPAD_UP)) != 0) { Tab(true); did = true; }
            if (did) swLast = now;
            if ((pressed & BTN_A) != 0) EndSwitcher(false, now);
            else if ((pressed & BTN_B) != 0) EndSwitcher(true, now);
            else if (now - swLast > 10000) EndSwitcher(false, now);
            if ((released & BACK) != 0) selChord = false;
            return;
        }
        if (swEdge && now >= cooldownUntil) { StartSwitcher(now); return; }

        if ((released & BACK) != 0) selChord = false;
        bool startWasChord = startChord;                      // Select+Start must never count as a plain Start press
        if ((released & START) != 0) startChord = false;

        // ---- mode specific ----
        if (swallow)
        {
            const int ANY = DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT | START | BACK | LB | RB | BTN_A | BTN_B | BTN_X | BTN_Y;
            bool stickBusy = mode == "nav" && (Math.Abs(Norm(p.LX)) > 0.55 || Math.Abs(Norm(p.LY)) > 0.55);
            if ((b & ANY) == 0 && !stickBusy) swallow = false; else return;
        }
        if (selHeld) { ReleaseMouse(); return; }           // Select is a chord prefix: nothing else acts while it is down

        if (mode == "mouse") MouseTick(p, b, pressed, released, dt);
        else if (mode == "nav") NavTick(p, b, pressed, released, now, startWasChord);
    }

    // ---------------- virtual mouse ----------------
    void MouseTick(PadState p, int b, int pressed, int released, double dt)
    {
        double scale = s.ScreenWidth() / 1920.0;
        if (scale < 0.5) scale = 0.5; else if (scale > 2.5) scale = 2.5;

        double lx = Norm(p.LX), ly = Norm(p.LY);
        double mag = Math.Sqrt(lx * lx + ly * ly);
        double vx = 0, vy = 0;
        if (mag > STICK_DZ)
        {
            double m = (mag - STICK_DZ) / (1.0 - STICK_DZ);
            if (m > 1) m = 1;
            double speed = (40.0 + 1460.0 * m * m) * scale;       // gentle near the centre, fast at full deflection
            vx += lx / mag * speed;
            vy += -ly / mag * speed;                               // XInput Y is up, the screen's Y is down
        }
        int dx = ((b & DPAD_RIGHT) != 0 ? 1 : 0) - ((b & DPAD_LEFT) != 0 ? 1 : 0);
        int dy = ((b & DPAD_DOWN) != 0 ? 1 : 0) - ((b & DPAD_UP) != 0 ? 1 : 0);
        if (dx != 0 || dy != 0)
        {
            dpadHold += dt;
            double sp = (260.0 + 1100.0 * Math.Min(1.0, dpadHold / 1200.0)) * scale;
            vx += dx * sp; vy += dy * sp;
        }
        else dpadHold = 0;

        accX += vx * dt / 1000.0; accY += vy * dt / 1000.0;
        int ix = (int)accX, iy = (int)accY;
        if (ix != 0 || iy != 0) { accX -= ix; accY -= iy; s.MoveBy(ix, iy); }

        double ry = Norm(p.RY), ary = Math.Abs(ry);
        if (ary > STICK_DZ)
        {
            double m = (ary - STICK_DZ) / (1.0 - STICK_DZ);
            wheelAcc += Math.Sign(ry) * m * m * 1800.0 * dt / 1000.0;    // up to 15 notches a second
            if (Math.Abs(wheelAcc) >= 20) { int w = (int)wheelAcc; wheelAcc -= w; s.Wheel(w); }
        }
        else wheelAcc = 0;

        if ((pressed & BTN_A) != 0 && !leftDown) { s.MouseButton(0, true); leftDown = true; }
        if ((released & BTN_A) != 0 && leftDown) { s.MouseButton(0, false); leftDown = false; }
        if ((pressed & BTN_B) != 0 && !rightDown) { s.MouseButton(1, true); rightDown = true; }
        if ((released & BTN_B) != 0 && rightDown) { s.MouseButton(1, false); rightDown = false; }
        if ((pressed & BTN_X) != 0) s.Emit("KEYBOARD");
    }

    // ---------------- navigation forwarded to the overlay / on-screen keyboard ----------------
    void Rep(int i, bool down, long now)
    {
        if (!down) { repWas[i] = false; return; }
        if (!repWas[i]) { repWas[i] = true; s.Emit("NAV " + RepNames[i]); repNext[i] = now + 380; }
        else if (now >= repNext[i]) { s.Emit("NAV " + RepNames[i]); repNext[i] = now + 120; }
    }

    void NavTick(PadState p, int b, int pressed, int released, long now, bool startWasChord)
    {
        double lx = Norm(p.LX), ly = Norm(p.LY);
        Rep(0, (b & DPAD_UP) != 0 || ly > 0.55, now);
        Rep(1, (b & DPAD_DOWN) != 0 || ly < -0.55, now);
        Rep(2, (b & DPAD_LEFT) != 0 || lx < -0.55, now);
        Rep(3, (b & DPAD_RIGHT) != 0 || lx > 0.55, now);
        Rep(4, (b & LB) != 0, now);
        Rep(5, (b & RB) != 0, now);
        if ((pressed & BTN_A) != 0) s.Emit("NAV confirm");
        if ((pressed & BTN_B) != 0) s.Emit("NAV back");
        if ((pressed & BTN_X) != 0) s.Emit("NAV x");
        if ((pressed & BTN_Y) != 0) s.Emit("NAV y");
        if ((released & START) != 0 && !startWasChord) s.Emit("NAV start");   // on release, so a chord never counts as a Start press
    }
}

// ---------------- the Windows side ----------------
[StructLayout(LayoutKind.Sequential)] public struct XGP { public ushort Buttons; public byte LT; public byte RT; public short LX; public short LY; public short RX; public short RY; }
[StructLayout(LayoutKind.Sequential)] public struct XST { public uint Packet; public XGP Pad; }
[StructLayout(LayoutKind.Sequential)] public struct PT { public int X; public int Y; }
[StructLayout(LayoutKind.Sequential)] public struct KBI { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
[StructLayout(LayoutKind.Sequential)] public struct MSI { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
[StructLayout(LayoutKind.Explicit)] public struct INU { [FieldOffset(0)] public MSI mi; [FieldOffset(0)] public KBI ki; }
[StructLayout(LayoutKind.Sequential)] public struct INP { public uint type; public INU u; }

public static class Native
{
    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")] public static extern int XGet14(int user, out XST s);
    [DllImport("xinput9_1_0.dll", EntryPoint = "XInputGetState")] public static extern int XGet91(int user, out XST s);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, int data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out PT p);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INP[] inputs, int size);
    [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint ms);
    [DllImport("winmm.dll")] public static extern uint timeEndPeriod(uint ms);
}

public class WinSink : ISink
{
    static readonly object outLock = new object();
    public IntPtr Shell = IntPtr.Zero;
    public IntPtr Saved = IntPtr.Zero;
    readonly int appPid;
    public WinSink(int appPid) { this.appPid = appPid; }

    public void Emit(string line) { lock (outLock) { Console.Out.WriteLine(line); Console.Out.Flush(); } }

    public void MoveBy(int dx, int dy)
    {
        PT p;
        if (Native.GetCursorPos(out p)) Native.SetCursorPos(p.X + dx, p.Y + dy);
    }
    public void Wheel(int delta) { Native.mouse_event(0x0800, 0, 0, delta, UIntPtr.Zero); }
    public void MouseButton(int which, bool down)
    {
        uint f = which == 0 ? (down ? 0x0002u : 0x0004u) : (down ? 0x0008u : 0x0010u);
        Native.mouse_event(f, 0, 0, 0, UIntPtr.Zero);
    }
    public void Key(int vk, bool down)
    {
        bool ext = vk >= 0x21 && vk <= 0x2E;                       // arrows, home/end, insert/delete...
        uint flags = (down ? 0u : 2u) | (ext ? 1u : 0u);
        Native.keybd_event((byte)vk, 0, flags, UIntPtr.Zero);
    }
    public int ForegroundPid() { uint p; Native.GetWindowThreadProcessId(Native.GetForegroundWindow(), out p); return (int)p; }
    public int ScreenWidth() { return Native.GetSystemMetrics(0); }
    public void TakeShell() { Take(Shell); }

    // Windows only lets a process that just produced input steal the foreground, so tap Alt first.
    // Not needed (and skipped) when the window is already in front: that Alt tap would reach the page as a real keydown.
    public void Take(IntPtr h)
    {
        if (h == IntPtr.Zero || !Native.IsWindow(h)) return;
        if (Native.GetForegroundWindow() == h) return;
        if (Native.IsIconic(h)) Native.ShowWindow(h, 9);
        Native.keybd_event(0x12, 0, 0, UIntPtr.Zero);
        Native.keybd_event(0x12, 0, 2, UIntPtr.Zero);
        Native.SetForegroundWindow(h);
    }

    public void SaveForeground()
    {
        IntPtr h = Native.GetForegroundWindow();
        uint pid; Native.GetWindowThreadProcessId(h, out pid);
        Saved = (int)pid == appPid ? IntPtr.Zero : h;
    }
    public void RestoreForeground()
    {
        IntPtr h = Saved; Saved = IntPtr.Zero;
        if (h != IntPtr.Zero) Take(h);
    }

    // Types text into whatever has focus (Unicode, so any layout / symbol works).
    public void TypeText(string text)
    {
        List<INP> list = new List<INP>();
        foreach (char c in text)
        {
            INP d = new INP(); d.type = 1; d.u.ki.scan = c; d.u.ki.flags = 0x0004;
            INP u = new INP(); u.type = 1; u.u.ki.scan = c; u.u.ki.flags = 0x0004 | 0x0002;
            list.Add(d); list.Add(u);
        }
        if (list.Count > 0) Native.SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INP)));
    }
}

public static class Bridge
{
    static readonly object gate = new object();
    static volatile bool running = true;

    static int XGet(int i, out XST s)
    {
        try { return Native.XGet14(i, out s); }
        catch (DllNotFoundException) { return Native.XGet91(i, out s); }
    }

    static IntPtr Hwnd(string s) { long v; return long.TryParse(s, out v) ? new IntPtr(v) : IntPtr.Zero; }

    static void Command(string line, WinSink sink, Core core)
    {
        string[] parts = line.Trim().Split(new char[] { ' ' }, 2);
        string cmd = parts[0].ToUpperInvariant();
        string arg = parts.Length > 1 ? parts[1].Trim() : "";
        lock (gate)
        {
            switch (cmd)
            {
                case "MODE": core.SetMode(arg.ToLowerInvariant()); break;
                case "SHELL": sink.Shell = Hwnd(arg); break;
                case "FOCUS": sink.Take(Hwnd(arg)); break;
                case "SAVEFG": sink.SaveForeground(); break;
                case "RESTOREFG": sink.RestoreForeground(); break;
                case "SWITCH": core.StartSwitcher(Environment.TickCount); break;
                case "TYPE":
                    try { sink.TypeText(Encoding.UTF8.GetString(Convert.FromBase64String(arg))); } catch (FormatException) { }
                    break;
                case "KEY":
                    int vk = arg == "bksp" ? 0x08 : arg == "enter" ? 0x0D : arg == "esc" ? 0x1B : arg == "tab" ? 0x09 : 0;
                    if (vk != 0) { sink.Key(vk, true); sink.Key(vk, false); }
                    break;
                case "QUIT": running = false; break;
            }
        }
    }

    public static void Run(int appPid, int returnHoldMs, int comboHoldMs, int switcherHoldMs)
    {
        try { Native.SetProcessDPIAware(); } catch (Exception) { }     // physical pixels, so SetCursorPos matches what is on screen
        try { Native.timeBeginPeriod(1); } catch (Exception) { }
        WinSink sink = new WinSink(appPid);
        Core core = new Core(sink, appPid, returnHoldMs, comboHoldMs, switcherHoldMs);

        Thread reader = new Thread(delegate ()
        {
            try
            {
                string line;
                while (running && (line = Console.In.ReadLine()) != null) Command(line, sink, core);
            }
            catch (Exception) { }
            running = false;                                              // stdin closed: Durv Software is gone
        });
        reader.IsBackground = true;
        reader.Start();

        sink.Emit("READY");

        Stopwatch sw = Stopwatch.StartNew();
        long[] retry = new long[4];
        long nextAlive = 2000;
        while (running)
        {
            long now = sw.ElapsedMilliseconds;
            PadState p = new PadState();
            double bestL = -1, bestR = -1;
            for (int i = 0; i < 4; i++)
            {
                if (retry[i] > now) continue;                              // empty slots are slow to query: look every 1.5 s
                XST st;
                int r;
                try { r = XGet(i, out st); } catch (Exception) { running = false; break; }   // no XInput at all
                if (r != 0) { retry[i] = now + 1500; continue; }
                p.Connected = true;
                p.Buttons |= st.Pad.Buttons;
                if (st.Pad.LT > p.LT) p.LT = st.Pad.LT;
                if (st.Pad.RT > p.RT) p.RT = st.Pad.RT;
                double ml = Math.Abs((double)st.Pad.LX) + Math.Abs((double)st.Pad.LY);
                double mr = Math.Abs((double)st.Pad.RX) + Math.Abs((double)st.Pad.RY);
                if (ml > bestL) { bestL = ml; p.LX = st.Pad.LX; p.LY = st.Pad.LY; }
                if (mr > bestR) { bestR = mr; p.RX = st.Pad.RX; p.RY = st.Pad.RY; }
            }
            string mode;
            lock (gate) { core.Tick(p, now); mode = core.Mode; }

            if (now > nextAlive)
            {
                nextAlive = now + 2000;
                try { Process.GetProcessById(appPid); } catch (ArgumentException) { running = false; }
            }
            Thread.Sleep(mode == "idle" ? 33 : 8);                         // ~30 polls/s when idle, ~125/s while the mouse / menu needs it
        }
        lock (gate) { core.Shutdown(); }
        try { Native.timeEndPeriod(1); } catch (Exception) { }
    }
}
