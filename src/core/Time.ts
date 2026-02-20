/**
 * Time management system with fixed timestep support for deterministic physics
 *
 * Usage:
 * - Time.delta: Variable frame delta (use for rendering/animations)
 * - Time.fixedDelta: Fixed physics timestep (use for physics/gameplay logic)
 * - Time.elapsed: Total elapsed time since start
 * - Time.fixedUpdate(callback): Run callback at fixed timestep intervals
 */

class TimeManager {
  // Frame timing
  private _delta: number = 0;
  private _elapsed: number = 0;
  private _lastTime: number = 0;
  private _started: boolean = false;

  // Fixed timestep
  private readonly _fixedDelta: number = 1 / 60; // 60 Hz physics
  private _accumulator: number = 0;
  private readonly _maxDelta: number = 0.1; // Cap to prevent spiral of death

  // Time scale (for slow-mo effects)
  private _timeScale: number = 1.0;

  // Frame counting
  private _frameCount: number = 0;
  private _fps: number = 0;
  private _fpsAccumulator: number = 0;
  private _fpsFrameCount: number = 0;

  /**
   * Variable frame delta in seconds (capped and scaled)
   * Use for rendering, animations, UI
   */
  get delta(): number {
    return this._delta * this._timeScale;
  }

  /**
   * Raw delta without time scale
   */
  get rawDelta(): number {
    return this._delta;
  }

  /**
   * Fixed timestep delta in seconds
   * Use for physics and gameplay logic
   */
  get fixedDelta(): number {
    return this._fixedDelta;
  }

  /**
   * Total elapsed time in seconds
   */
  get elapsed(): number {
    return this._elapsed;
  }

  /**
   * Current frames per second
   */
  get fps(): number {
    return this._fps;
  }

  /**
   * Total frame count since start
   */
  get frameCount(): number {
    return this._frameCount;
  }

  /**
   * Time scale multiplier (1.0 = normal, 0.5 = half speed)
   */
  get timeScale(): number {
    return this._timeScale;
  }

  set timeScale(value: number) {
    this._timeScale = Math.max(0, value);
  }

  /**
   * Initialize the time system
   * Call once at game start
   */
  init(): void {
    this._lastTime = performance.now() / 1000;
    this._started = true;
    this._frameCount = 0;
    this._elapsed = 0;
    this._accumulator = 0;
  }

  /**
   * Update time values
   * Call once per frame at the start of the game loop
   */
  update(): void {
    if (!this._started) {
      this.init();
    }

    const now = performance.now() / 1000;
    this._delta = Math.min(now - this._lastTime, this._maxDelta);
    this._lastTime = now;
    this._elapsed += this._delta * this._timeScale;
    this._frameCount++;

    // Accumulate for fixed timestep
    this._accumulator += this._delta * this._timeScale;

    // FPS calculation (update every second)
    this._fpsAccumulator += this._delta;
    this._fpsFrameCount++;
    if (this._fpsAccumulator >= 1.0) {
      this._fps = this._fpsFrameCount / this._fpsAccumulator;
      this._fpsAccumulator = 0;
      this._fpsFrameCount = 0;
    }
  }

  /**
   * Run a callback at fixed timestep intervals
   * Implements accumulator pattern for deterministic physics
   *
   * @param callback Function to call for each fixed timestep
   * @returns Number of fixed updates performed this frame
   */
  fixedUpdate(callback: (fixedDelta: number) => void): number {
    let steps = 0;
    const maxSteps = 10; // Prevent infinite loop on very slow frames

    while (this._accumulator >= this._fixedDelta && steps < maxSteps) {
      callback(this._fixedDelta);
      this._accumulator -= this._fixedDelta;
      steps++;
    }

    return steps;
  }

  /**
   * Get interpolation alpha for rendering between physics steps
   * Use for smooth visual interpolation
   */
  getAlpha(): number {
    return this._accumulator / this._fixedDelta;
  }

  /**
   * Reset the time system
   */
  reset(): void {
    this._delta = 0;
    this._elapsed = 0;
    this._accumulator = 0;
    this._frameCount = 0;
    this._fps = 0;
    this._fpsAccumulator = 0;
    this._fpsFrameCount = 0;
    this._timeScale = 1.0;
    this._started = false;
  }

  /**
   * Pause time (set timeScale to 0)
   */
  pause(): void {
    this._timeScale = 0;
  }

  /**
   * Resume time (reset timeScale to 1)
   */
  resume(): void {
    this._timeScale = 1;
  }

  /**
   * Check if time is paused
   */
  isPaused(): boolean {
    return this._timeScale === 0;
  }
}

// Singleton instance
export const Time = new TimeManager();
