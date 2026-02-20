/**
 * HUDView - Dark Souls style HUD (HP/Stamina bars)
 *
 * Usage:
 * - Initialize with HUDView.init()
 * - Automatically subscribes to EventBus events
 * - Call HUDView.destroy() to clean up
 *
 * Events listened:
 * - player:healthChanged
 * - player:staminaChanged
 * - player:died
 * - player:respawned
 */

import { EventBus } from '../core/EventBus';

/**
 * HUD configuration
 */
export interface HUDConfig {
  // Bar dimensions
  barWidth: number;
  barHeight: number;
  barGap: number;

  // Position
  top: number;
  left: number;

  // Colors
  hpColor: string;
  hpBackgroundColor: string;
  hpBorderColor: string;
  staminaColor: string;
  staminaBackgroundColor: string;
  staminaBorderColor: string;

  // Animation
  damageFlashDuration: number;
  lowHpThreshold: number;
  lowStaminaThreshold: number;
}

const DEFAULT_CONFIG: HUDConfig = {
  barWidth: 250,
  barHeight: 20,
  barGap: 8,

  top: 30,
  left: 30,

  hpColor: '#8b0000',
  hpBackgroundColor: '#2a0000',
  hpBorderColor: '#4a0000',
  staminaColor: '#228b22',
  staminaBackgroundColor: '#0a2a0a',
  staminaBorderColor: '#1a4a1a',

  damageFlashDuration: 200,
  lowHpThreshold: 0.25,
  lowStaminaThreshold: 0.2,
};

/**
 * HUDView class
 */
class HUDViewClass {
  private container: HTMLElement | null = null;
  private hpBar: HTMLElement | null = null;
  private hpFill: HTMLElement | null = null;
  private hpDelayed: HTMLElement | null = null;
  private staminaBar: HTMLElement | null = null;
  private staminaFill: HTMLElement | null = null;

  private config: HUDConfig = DEFAULT_CONFIG;
  private unsubscribers: (() => void)[] = [];

  private currentHp: number = 100;
  private maxHp: number = 100;
  private currentStamina: number = 100;
  private maxStamina: number = 100;

  private delayedHp: number = 100;
  private delayedHpTimer: ReturnType<typeof setTimeout> | null = null;

  private visible: boolean = false;

  /**
   * Initialize the HUD
   */
  init(config?: Partial<HUDConfig>): void {
    if (this.container) return;

    this.config = { ...DEFAULT_CONFIG, ...config };

    this.createDOM();
    this.subscribeEvents();
    this.show();
  }

  /**
   * Create DOM elements
   */
  private createDOM(): void {
    // Container
    this.container = document.createElement('div');
    this.container.id = 'hud-container';
    this.container.style.cssText = `
      position: fixed;
      top: ${this.config.top}px;
      left: ${this.config.left}px;
      z-index: 1000;
      pointer-events: none;
      font-family: 'Cinzel', serif;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    // HP Bar
    this.hpBar = this.createBar('hp', this.config.hpColor, this.config.hpBackgroundColor, this.config.hpBorderColor);
    this.hpFill = this.hpBar.querySelector('.bar-fill') as HTMLElement;
    this.hpDelayed = this.hpBar.querySelector('.bar-delayed') as HTMLElement;

    // Stamina Bar
    this.staminaBar = this.createBar('stamina', this.config.staminaColor, this.config.staminaBackgroundColor, this.config.staminaBorderColor);
    this.staminaFill = this.staminaBar.querySelector('.bar-fill') as HTMLElement;
    this.staminaBar.style.marginTop = `${this.config.barGap}px`;

    // Remove delayed bar from stamina (not needed)
    const staminaDelayed = this.staminaBar.querySelector('.bar-delayed');
    if (staminaDelayed) staminaDelayed.remove();

    this.container.appendChild(this.hpBar);
    this.container.appendChild(this.staminaBar);
    document.body.appendChild(this.container);
  }

  /**
   * Create a single bar element
   */
  private createBar(id: string, fillColor: string, bgColor: string, borderColor: string): HTMLElement {
    const bar = document.createElement('div');
    bar.id = `${id}-bar`;
    bar.style.cssText = `
      position: relative;
      width: ${this.config.barWidth}px;
      height: ${this.config.barHeight}px;
      background: ${bgColor};
      border: 2px solid ${borderColor};
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5), inset 0 0 5px rgba(0, 0, 0, 0.3);
    `;

    // Delayed damage indicator (red -> yellow delay)
    const delayed = document.createElement('div');
    delayed.className = 'bar-delayed';
    delayed.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background: #d4a54a;
      transition: width 0.5s ease;
    `;

    // Main fill
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background: ${fillColor};
      transition: width 0.15s ease;
    `;

    // Shine effect
    const shine = document.createElement('div');
    shine.className = 'bar-shine';
    shine.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 50%;
      background: linear-gradient(to bottom, rgba(255,255,255,0.1), transparent);
      pointer-events: none;
    `;

    bar.appendChild(delayed);
    bar.appendChild(fill);
    bar.appendChild(shine);

    return bar;
  }

  /**
   * Subscribe to EventBus events
   */
  private subscribeEvents(): void {
    this.unsubscribers.push(
      EventBus.on('player:healthChanged', (data) => {
        this.setHP(data.current, data.max);
      })
    );

    this.unsubscribers.push(
      EventBus.on('player:staminaChanged', (data) => {
        this.setStamina(data.current, data.max);
      })
    );

    this.unsubscribers.push(
      EventBus.on('player:died', () => {
        this.onPlayerDied();
      })
    );

    this.unsubscribers.push(
      EventBus.on('player:respawned', () => {
        this.onPlayerRespawned();
      })
    );
  }

  /**
   * Set HP value
   */
  setHP(current: number, max: number): void {
    const previousHp = this.currentHp;
    this.currentHp = current;
    this.maxHp = max;

    const percentage = Math.max(0, Math.min(100, (current / max) * 100));

    if (this.hpFill) {
      this.hpFill.style.width = `${percentage}%`;
    }

    // Delayed damage effect
    if (current < previousHp && this.hpDelayed) {
      // Clear existing timer
      if (this.delayedHpTimer) {
        clearTimeout(this.delayedHpTimer);
      }

      // Update delayed bar after short delay
      this.delayedHpTimer = setTimeout(() => {
        this.delayedHp = current;
        if (this.hpDelayed) {
          this.hpDelayed.style.width = `${percentage}%`;
        }
      }, 300);
    } else if (current > previousHp && this.hpDelayed) {
      // Healing - update immediately
      this.delayedHp = current;
      this.hpDelayed.style.width = `${percentage}%`;
    }

    // Low HP warning
    if (this.hpBar) {
      if (percentage <= this.config.lowHpThreshold * 100) {
        this.hpBar.style.animation = 'hud-pulse 0.5s ease-in-out infinite';
      } else {
        this.hpBar.style.animation = '';
      }
    }

    // Damage flash
    if (current < previousHp && this.hpFill) {
      this.hpFill.style.background = '#ff0000';
      setTimeout(() => {
        if (this.hpFill) {
          this.hpFill.style.background = this.config.hpColor;
        }
      }, this.config.damageFlashDuration);
    }
  }

  /**
   * Set stamina value
   */
  setStamina(current: number, max: number): void {
    this.currentStamina = current;
    this.maxStamina = max;

    const percentage = Math.max(0, Math.min(100, (current / max) * 100));

    if (this.staminaFill) {
      this.staminaFill.style.width = `${percentage}%`;
    }

    // Low stamina warning
    if (this.staminaBar) {
      if (percentage <= this.config.lowStaminaThreshold * 100) {
        this.staminaFill!.style.background = '#ffff00';
      } else {
        this.staminaFill!.style.background = this.config.staminaColor;
      }
    }
  }

  /**
   * Handle player death
   */
  private onPlayerDied(): void {
    // Fade out HUD
    if (this.container) {
      this.container.style.opacity = '0.3';
    }
  }

  /**
   * Handle player respawn
   */
  private onPlayerRespawned(): void {
    // Reset and show HUD
    this.setHP(this.maxHp, this.maxHp);
    this.setStamina(this.maxStamina, this.maxStamina);

    if (this.container) {
      this.container.style.opacity = '1';
    }
  }

  /**
   * Show HUD
   */
  show(): void {
    if (this.container) {
      this.container.style.opacity = '1';
      this.visible = true;
    }
  }

  /**
   * Hide HUD
   */
  hide(): void {
    if (this.container) {
      this.container.style.opacity = '0';
      this.visible = false;
    }
  }

  /**
   * Toggle HUD visibility
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if HUD is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Destroy HUD
   */
  destroy(): void {
    // Unsubscribe events
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    // Clear timers
    if (this.delayedHpTimer) {
      clearTimeout(this.delayedHpTimer);
    }

    // Remove DOM
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.hpBar = null;
    this.hpFill = null;
    this.hpDelayed = null;
    this.staminaBar = null;
    this.staminaFill = null;
  }
}

// Inject CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes hud-pulse {
    0%, 100% { box-shadow: 0 0 10px rgba(139, 0, 0, 0.5), inset 0 0 5px rgba(0, 0, 0, 0.3); }
    50% { box-shadow: 0 0 20px rgba(255, 0, 0, 0.8), inset 0 0 5px rgba(0, 0, 0, 0.3); }
  }
`;
document.head.appendChild(style);

// Singleton instance
export const HUDView = new HUDViewClass();
