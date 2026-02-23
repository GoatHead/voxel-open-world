import { useEffect, useMemo, useState } from "react"

import type { ChunkManagerStats } from "./engine/chunkManager"
import { Game } from "./game/Game"
import { DEFAULT_SHADER_SETTINGS, type ShaderSettings } from "./game/shaderSettings"
import { makeShareUrl, parseSeedFromUrl, randomSeedStr } from "./lib/seed"

type ShaderField = keyof ShaderSettings

export default function App() {
  const [seed] = useState(() => {
    const parsed = parseSeedFromUrl()
    return parsed.seedStr ?? randomSeedStr()
  })

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return makeShareUrl(seed, {
      origin: window.location.origin,
      pathname: window.location.pathname,
    })
  }, [seed])

  const [isOverlayVisible, setIsOverlayVisible] = useState(true)
  const [copyStatus, setCopyStatus] = useState("")
  const [chunkCount, setChunkCount] = useState(0)
  const [fps, setFps] = useState(0)
  const [chunkStats, setChunkStats] = useState<ChunkManagerStats>({
    loaded: 0,
    queued: 0,
    inflight: 0,
    ready: 0,
  })
  const [shaderEnabled, setShaderEnabled] = useState(true)
  const [rayTracingEnabled, setRayTracingEnabled] = useState(false)
  const [shaderSettings, setShaderSettings] = useState<ShaderSettings>(DEFAULT_SHADER_SETTINGS)

  const isDebugMode = useMemo(() => {
    if (typeof window === "undefined") {
      return false
    }

    return new URLSearchParams(window.location.search).get("debug") === "1"
  }, [])

  useEffect(() => {
    let lastTick = performance.now()
    let frames = 0
    let frameId = 0

    const updateFps = (now: number) => {
      frames += 1
      const elapsed = now - lastTick

      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed))
        frames = 0
        lastTick = now
      }

      frameId = requestAnimationFrame(updateFps)
    }

    frameId = requestAnimationFrame(updateFps)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [])

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      const copied = await navigator.clipboard
        .writeText(text)
        .then(() => true, () => false)

      if (copied) {
        return true
      }
    }

    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "absolute"
    textarea.style.left = "-9999px"
    textarea.style.top = "-9999px"
    document.body.appendChild(textarea)

    textarea.focus()
    textarea.select()

    let success = false
    try {
      success = document.execCommand("copy")
    } catch {
      success = false
    } finally {
      document.body.removeChild(textarea)
    }

    return success
  }

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl)
    setCopyStatus(ok ? "copied" : "copy failed")
  }

  const closeOverlay = () => setIsOverlayVisible(false)

  const updateShader = (field: ShaderField, value: number) => {
    setShaderSettings((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const resetShader = () => {
    setShaderSettings(DEFAULT_SHADER_SETTINGS)
  }

  return (
    <div className="app-shell">
      <Game
        seedStr={seed}
        shaderEnabled={shaderEnabled}
        rayTracingEnabled={rayTracingEnabled}
        shaderSettings={shaderSettings}
        onChunkCountChange={setChunkCount}
        onChunkStatsChange={isDebugMode ? setChunkStats : undefined}
      />

      <aside className="fps-toolbox" data-testid="fps-toolbox">
        <h2>FPS</h2>
        <p>{fps}</p>
        <p>Chunks: {chunkCount}</p>
      </aside>

      {!isOverlayVisible && <div className="crosshair" aria-hidden="true" />}

      <aside className="shader-toolbox" data-testid="shader-toolbox">
        <h2>Shader Toolbox</h2>
        <label className="shader-toggle">
          <input
            type="checkbox"
            checked={shaderEnabled}
            onChange={(event) => {
              setShaderEnabled(event.target.checked)
            }}
          />
          <span>Shader On/Off</span>
        </label>
        <label className="shader-toggle">
          <input
            type="checkbox"
            checked={rayTracingEnabled}
            disabled={!shaderEnabled}
            onChange={(event) => {
              setRayTracingEnabled(event.target.checked)
            }}
          />
          <span>Ray Tracing (Approx)</span>
        </label>
        <ShaderSlider
          label={`Banding: ${shaderSettings.banding.toFixed(1)}`}
          min={2}
          max={12}
          step={1}
          value={shaderSettings.banding}
          onChange={(value) => updateShader("banding", value)}
        />
        <ShaderSlider
          label={`Ambient: ${shaderSettings.ambient.toFixed(2)}`}
          min={0.2}
          max={1.1}
          step={0.01}
          value={shaderSettings.ambient}
          onChange={(value) => updateShader("ambient", value)}
        />
        <ShaderSlider
          label={`Sunlight: ${shaderSettings.sunlight.toFixed(2)}`}
          min={0.2}
          max={1.6}
          step={0.01}
          value={shaderSettings.sunlight}
          onChange={(value) => updateShader("sunlight", value)}
        />
        <ShaderSlider
          label={`Contrast: ${shaderSettings.contrast.toFixed(2)}`}
          min={0.7}
          max={1.6}
          step={0.01}
          value={shaderSettings.contrast}
          onChange={(value) => updateShader("contrast", value)}
        />
        <ShaderSlider
          label={`Saturation: ${shaderSettings.saturation.toFixed(2)}`}
          min={0.6}
          max={1.6}
          step={0.01}
          value={shaderSettings.saturation}
          onChange={(value) => updateShader("saturation", value)}
        />
        <ShaderSlider
          label={`Rim: ${shaderSettings.rim.toFixed(2)}`}
          min={0}
          max={0.8}
          step={0.01}
          value={shaderSettings.rim}
          onChange={(value) => updateShader("rim", value)}
        />
        <button type="button" onClick={resetShader}>Default</button>
      </aside>

      {isOverlayVisible && (
        <div className="hud-overlay" data-testid="overlay" onClick={closeOverlay}>
          <section className="hud-card" role="button" tabIndex={0} onClick={closeOverlay}>
            <h1>Click to Play</h1>
            <p>
              Seed: <span data-testid="seed">{seed}</span>
            </p>
            <p>FPS: {fps}</p>
            <p>
              Share URL: <span data-testid="share-url">{shareUrl}</span>
            </p>
            <p>
              Chunk count: <span data-testid="chunk-count">{chunkCount}</span>
            </p>
            {isDebugMode && (
              <p>
                Chunk debug: loaded={chunkStats.loaded} queued={chunkStats.queued} inflight={chunkStats.inflight} ready={chunkStats.ready}
              </p>
            )}
            <button
              data-testid="copy-link"
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void handleCopy()
              }}
            >
              Copy share link
            </button>
            <p data-testid="copy-status">{copyStatus}</p>
          </section>
        </div>
      )}
    </div>
  )
}

type ShaderSliderProps = {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

function ShaderSlider({ label, min, max, step, value, onChange }: ShaderSliderProps) {
  return (
    <label className="shader-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value))
        }}
      />
    </label>
  )
}
