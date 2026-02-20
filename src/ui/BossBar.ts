/**
 * BossBar - Dark Souls style boss health bar
 *
 * Usage:
 * - Show with BossBar.show(name, currentHp, maxHp)
 * - Updates automatically via EventBus
 * - Hide with BossBar.hide()
 *
 * Events listened:
 * - boss:engaged
 * - boss:healthChanged
 * - boss:died
 * - boss:staggered
 */

import { EventBus } from '../core/EventBus';

/**
 * Boss bar configuration
 */
export interface BossBarConfig {
  // Dimensions
  barWidth: number;
  barHeight: number;

  // Position
  bottom: number;

  // Colors
  hpColor: string;
  hpBackgroundColor: string;
  hpBorderColor: string;
  staggeredColor: string;

  // Animation
  showDuration: number;
  hideDuration: number;
  damageFlashDuration: number;
}

const DEFAULT_CONFIG: BossBarConfig = {
  barWidth: 600,
  barHeight: 25,

  bottom: 80,

  hpColor: '#8b4513',
  hpBackgroundColor: '#1a0a00',
  hpBorderColor: '#4a2a10',
  staggeredColor: '#ffd700',

  showDuration: 500,
  hideDuration: 1000,
  damageFlashDuration: 150,
};

/**
 * BossBar class
 */
class BossBarClass {
  private container: HTMLElement | null = null;
  private nameElement: HTMLElement | null = null;
  private barContainer: HTMLElement | null = null;
  private hpFill: HTMLElement | null = null;
  private hpDelayed: HTMLElement | null = null;

  private config: BossBarConfig = DEFAULT_CONFIG;
  private unsubscribers: (() => void)[] = [];

  private bossName: string = '';
  private currentHp: number = 0;
  private maxHp: number = 0;
  private delayedHp: number = 0;
  private delayedTimer: ReturnType<typeof setTimeout> | null = null;

  private visible: boolean = false;
  private staggered: boolean = false;

  /**
   * Initialize the boss bar
   */
  init(config?: Partial<BossBarConfig>): void {
    if (this.container) return;

    this.config = { ...DEFAULT_CONFIG, ...config };

    this.createDOM();
    this.subscribeEvents();
  }

  /**
   * Create DOM elements
   */
  private createDOM(): void {
    // Container
    this.container = document.createElement('div');
    this.container.id = 'boss-bar-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: ${this.config.bottom}px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      pointer-events: none;
      font-family: 'Cinzel', serif;
      text-align: center;
      opacity: 0;
      transition: opacity ${this.config.showDuration}ms ease;
    `;

    // Boss name
    this.nameElement = document.createElement('div');
    this.nameElement.id = 'boss-name';
    this.nameElement.style.cssText = `
      color: #d4a54a;
      font-size: 1.5rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      text-shadow: 0 0 10px rgba(0, 0, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.5);
      margin-bottom: 10px;
    `;

    // Bar container
    this.barContainer = document.createElement('div');
    this.barContainer.id = 'boss-hp-bar';
    this.barContainer.style.cssText = `
      position: relative;
      width: ${this.config.barWidth}px;
      height: ${this.config.barHeight}px;
      background: ${this.config.hpBackgroundColor};
      border: 2px solid ${this.config.hpBorderColor};
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.8), inset 0 0 10px rgba(0, 0, 0, 0.5);
    `;

    // Delayed damage (yellow)
    this.hpDelayed = document.createElement('div');
    this.hpDelayed.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background: #d4a54a;
      transition: width 0.8s ease;
    `;

    // HP fill
    this.hpFill = document.createElement('div');
    this.hpFill.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background: ${this.config.hpColor};
      transition: width 0.2s ease;
    `;

    // Shine effect
    const shine = document.createElement('div');
    shine.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 40%;
      background: linear-gradient(to bottom, rgba(255,255,255,0.15), transparent);
      pointer-events: none;
    `;

    // Decorative elements
    const leftDecor = this.createDecoration('left');
    const rightDecor = this.createDecoration('right');

    this.barContainer.appendChild(this.hpDelayed);
    this.barContainer.appendChild(this.hpFill);
    this.barContainer.appendChild(shine);
    this.barContainer.appendChild(leftDecor);
    this.barContainer.appendChild(rightDecor);

    this.container.appendChild(this.nameElement);
    this.container.appendChild(this.barContainer);

    document.body.appendChild(this.container);
  }

  /**
   * Create decorative element
   */
  private createDecoration(side: 'left' | 'right'): HTMLElement {
    const decor = document.createElement('div');
    decor.style.cssText = `
      position: absolute;
      ${side}: -15px;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-top: 12px solid transparent;
      border-bottom: 12px solid transparent;
      border-${side === 'left' ? 'right' : 'left'}: 15px solid ${this.config.hpBorderColor};
    `;
    return decor;
  }

  /**
   * Subscribe to EventBus events
   */
  private subscribeEvents(): void {
    this.unsubscribers.push(
      EventBus.on('boss:engaged', (data) => {
        this.show(data.name, data.maxHp, data.maxHp);
      })
    );

    this.unsubscribers.push(
      EventBus.on('boss:healthChanged', (data) => {
        this.setHP(data.current, data.max);
      })
    );

    this.unsubscribers.push(
      EventBus.on('boss:died', () => {
        this.onBossDied();
      })
    );

    this.unsubscribers.push(
      EventBus.on('boss:staggered', (data) => {
        this.onBossStaggered(data.duration);
      })
    );
  }

  /**
   * Show the boss bar
   */
  show(name: string, currentHp: number, maxHp: number): void {
    this.bossName = name;
    this.currentHp = currentHp;
    this.maxHp = maxHp;
    this.delayedHp = currentHp;

    if (this.nameElement) {
      this.nameElement.textContent = name;
    }

    this.setHP(currentHp, maxHp);

    if (this.container) {
      this.container.style.opacity = '1';
    }

    this.visible = true;
  }

  /**
   * Hide the boss bar
   */
  hide(): void {
    if (this.container) {
      this.container.style.transition = `opacity ${this.config.hideDuration}ms ease`;
      this.container.style.opacity = '0';
    }

    this.visible = false;
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
      if (this.delayedTimer) {
        clearTimeout(this.delayedTimer);
      }

      this.delayedTimer = setTimeout(() => {
        this.delayedHp = current;
        if (this.hpDelayed) {
          this.hpDelayed.style.width = `${percentage}%`;
        }
      }, 500);
    }

    // Damage flash
    if (current < previousHp && this.hpFill) {
      this.hpFill.style.background = '#ffffff';
      setTimeout(() => {
        if (this.hpFill) {
          this.hpFill.style.background = this.staggered
            ? this.config.staggeredColor
            : this.config.hpColor;
        }
      }, this.config.damageFlashDuration);
    }
  }

  /**
   * Handle boss death
   */
  private onBossDied(): void {
    // Flash and fade out
    if (this.hpFill) {
      this.hpFill.style.background = '#ff0000';
    }

    setTimeout(() => {
      this.hide();
    }, 1500);
  }

  /**
   * Handle boss staggered
   */
  private onBossStaggered(duration: number): void {
    this.staggered = true;

    if (this.hpFill) {
      this.hpFill.style.background = this.config.staggeredColor;
    }

    if (this.barContainer) {
      this.barContainer.style.animation = 'boss-stagger-pulse 0.3s ease-in-out infinite';
    }

    setTimeout(() => {
      this.staggered = false;
      if (this.hpFill) {
        this.hpFill.style.background = this.config.hpColor;
      }
      if (this.barContainer) {
        this.barContainer.style.animation = '';
      }
    }, duration * 1000);
  }

  /**
   * Check if visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Get current boss name
   */
  getBossName(): string {
    return this.bossName;
  }

  /**
   * Destroy boss bar
   */
  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    if (this.delayedTimer) {
      clearTimeout(this.delayedTimer);
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.nameElement = null;
    this.barContainer = null;
    this.hpFill = null;
    this.hpDelayed = null;
  }
}

// Inject CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes boss-stagger-pulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0, 0, 0, 0.8), inset 0 0 10px rgba(0, 0, 0, 0.5); }
    50% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.6), inset 0 0 10px rgba(255, 215, 0, 0.3); }
  }
`;
document.head.appendChild(style);

// Singleton instance
export const BossBar = new BossBarClass();
