/**
 * App.jsx PATCHES — v2
 *
 * Two things to integrate into your existing App.jsx:
 *
 * PATCH 1 — SpeedSlider component (add anywhere above SprayScreen)
 * PATCH 2 — Updated SprayScreen that uses SpeedSlider
 * PATCH 3 — Updated OnboardScreen that accepts + shows hashtag & event color
 * PATCH 4 — Updated Root App that fetches event meta (hashtag, accentColor) from backend
 *
 * Search for the original component definitions and replace them with these.
 */

// ────────────────────────────────────────────────────────────────────────────────
// PATCH 1: SpeedSlider — horizontal drag control for spray speed
// ────────────────────────────────────────────────────────────────────────────────

const SPEED_SLIDER_CSS = `
  .speed-slider-wrap {
    background: var(--card); border: 0.5px solid var(--border);
    border-radius: 14px; padding: 14px 16px; margin-bottom: 0.875rem;
  }
  .speed-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
  }
  .speed-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--muted);
  }
  .speed-val {
    font-family: 'Cabinet Grotesk', sans-serif; font-size: 14px; font-weight: 800;
    color: var(--gold);
  }
  .speed-track {
    position: relative; height: 28px;
    display: flex; align-items: center;
  }
  .speed-rail {
    width: 100%; height: 4px; border-radius: 2px;
    background: rgba(233,162,40,0.1);
    border: 0.5px solid rgba(233,162,40,0.15);
    position: relative;
  }
  .speed-fill {
    position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px;
    transition: width 0.05s;
  }
  .speed-thumb {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--gold); border: 2px solid rgba(255,255,255,0.2);
    box-shadow: 0 0 10px rgba(233,162,40,0.5);
    cursor: grab; transition: transform 0.1s, box-shadow 0.1s;
    z-index: 2;
  }
  .speed-thumb:active { cursor: grabbing; transform: translate(-50%, -50%) scale(1.15); }
  .speed-range {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%;
  }
  .speed-ticks {
    display: flex; justify-content: space-between; margin-top: 6px;
  }
  .speed-tick { font-size: 9px; color: var(--muted); letter-spacing: 0.5px; }
  .speed-tick.active { color: var(--gold); font-weight: 700; }
`;

// Drop-in SpeedSlider component
export function SpeedSlider({ speed, onChange }) {
  // speed: 0.5 (drizzle) → 1 (normal) → 2 (pour)
  // Normalize to 0..100 for the range input
  const sliderVal = ((speed - 0.5) / 1.5) * 100;

  function handleChange(e) {
    const raw = parseFloat(e.target.value); // 0..100
    // Map 0..100 → 0.5..2
    const mapped = 0.5 + (raw / 100) * 1.5;
    onChange(parseFloat(mapped.toFixed(2)));
  }

  const label =
    speed <= 0.6 ? "🌦 Drizzle" :
    speed <= 0.9 ? "💧 Light"   :
    speed <= 1.1 ? "⚡ Normal"  :
    speed <= 1.5 ? "🌧 Heavy"   :
                   "🌊 Pour";

  const fillPct = sliderVal + "%";
  const thumbPct = sliderVal + "%";

  return (
    <>
      <style>{SPEED_SLIDER_CSS}</style>
      <div className="speed-slider-wrap">
        <div className="speed-header">
          <span className="speed-label">Spray Speed</span>
          <span className="speed-val">{label}</span>
        </div>
        <div className="speed-track">
          <div className="speed-rail">
            <div className="speed-fill" style={{ width: fillPct, background: "var(--gold)" }} />
            <div className="speed-thumb" style={{ left: thumbPct }} />
            <input
              type="range" className="speed-range"
              min="0" max="100" step="1"
              value={Math.round(sliderVal)}
              onChange={handleChange}
            />
          </div>
        </div>
        <div className="speed-ticks">
          {["Drizzle","Light","Normal","Heavy","Pour"].map((t, i) => (
            <span key={t} className={`speed-tick ${Math.round(sliderVal / 25) === i ? "active" : ""}`}>{t}</span>
          ))}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// PATCH 2: Updated SprayScreen — add SpeedSlider above the coin carousel
// Find your existing SprayScreen function and integrate as shown.
// The key changes are:
//   1. Accept `spraySpeed` and `setSpraySpeed` props (from useXRPL)
//   2. Render <SpeedSlider> above the coin carousel
//   3. Pass `spraySpeed` in the doSpray call (already handled in useXRPL)
// ────────────────────────────────────────────────────────────────────────────────

// In your SprayScreen props, add: spraySpeed, setSpraySpeed
// Then inside the JSX, before the coin carousel section, add:
//
// <SpeedSlider speed={spraySpeed} onChange={setSpraySpeed} />
//
// That's the full patch for SprayScreen.

// ────────────────────────────────────────────────────────────────────────────────
// PATCH 3: Updated OnboardScreen — shows hashtag + event color from event meta
// Replace your existing OnboardScreen with this version.
// ────────────────────────────────────────────────────────────────────────────────

const ONBOARD_EXTRA_CSS = `
  .event-meta-card {
    border-radius: 13px;
    padding: 14px 16px;
    margin-bottom: 0.875rem;
    display: flex; align-items: center; gap: 12px;
  }
  .event-meta-dot {
    width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
    box-shadow: 0 0 10px currentColor;
  }
  .event-meta-info { flex: 1; }
  .event-meta-hashtag {
    font-family: 'Clash Display', sans-serif;
    font-size: 18px; font-weight: 800; letter-spacing: 0.5px;
  }
  .event-meta-name {
    font-size: 12px; color: var(--muted); margin-top: 2px;
  }
`;

// Updated OnboardScreen signature:
// function OnboardScreen({ onDone, isLoading, error, eventMeta })
//
// eventMeta = { name, hashtag, accentColor } fetched from /api/events/:code
//
// Inside the JSX, after the sheet-inner opening and before the inputs, add:
//
// {eventMeta && (
//   <>
//     <style>{ONBOARD_EXTRA_CSS}</style>
//     <div className="event-meta-card" style={{
//       background: eventMeta.accentColor + "12",
//       border: "0.5px solid " + eventMeta.accentColor + "30"
//     }}>
//       <div className="event-meta-dot" style={{ background: eventMeta.accentColor, color: eventMeta.accentColor }} />
//       <div className="event-meta-info">
//         <div className="event-meta-hashtag" style={{ color: eventMeta.accentColor }}>{eventMeta.hashtag}</div>
//         <div className="event-meta-name">{eventMeta.name}</div>
//       </div>
//     </div>
//   </>
// )}

// ────────────────────────────────────────────────────────────────────────────────
// PATCH 4: Root App — fetch event meta when user types an event code
// Add this inside your Root App component (replace or augment handleOnboard):
// ────────────────────────────────────────────────────────────────────────────────

// Add a new state: const [eventMeta, setEventMeta] = useState(null);
//
// Add this function to fetch metadata when the code input loses focus or on submit:
//
// async function fetchEventMeta(code) {
//   if (!code || code.length < 4) return;
//   try {
//     const res = await fetch(`${BACKEND_URL}/api/events/${code}`);
//     if (res.ok) {
//       const data = await res.json();
//       setEventMeta({
//         name:        data.name       || code,
//         hashtag:     data.hashtag    || "",
//         accentColor: data.accentColor || "#E9A228",
//       });
//     }
//   } catch (_) {}
// }
//
// Pass eventMeta to <OnboardScreen eventMeta={eventMeta} ... />
// Pass eventMeta.accentColor / hashtag into <SprayScreen> if you want to theme it.
//
// In handleOnboard, also store the event's accentColor so the sprayer app
// can apply it via CSS variables:
//
// async function handleOnboard({ displayName: dn, eventCode: ec }) {
//   setDisplayName(dn);
//   setEventCode(ec);
//   await fetchEventMeta(ec);   // <-- add this line
//   await createWallet();
//   triggerConfetti();
//   setScreen(SCREENS.WALLET);
// }

// ────────────────────────────────────────────────────────────────────────────────
// Summary of all changes needed in App.jsx:
//
// 1. Import SpeedSlider from this file (or paste it inline)
// 2. Add spraySpeed, setSpraySpeed to the useXRPL destructure
// 3. Pass spraySpeed/setSpraySpeed as props to SprayScreen
// 4. Render <SpeedSlider speed={spraySpeed} onChange={setSpraySpeed} />
//    inside SprayScreen, just above the coin carousel section
// 5. Add eventMeta state + fetchEventMeta() to Root App
// 6. Call fetchEventMeta when event code is entered
// 7. Show hashtag + color badge in OnboardScreen when eventMeta is available
// ────────────────────────────────────────────────────────────────────────────────
