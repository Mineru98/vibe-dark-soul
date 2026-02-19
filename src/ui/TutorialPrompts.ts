/**
 * TutorialPrompts - Dark Souls style tutorial messages
 *
 * Usage:
 * - Show with TutorialPrompts.show(message, action?)
 * - Hide with TutorialPrompts.hide()
 * - Automatically hides after timeout or input
 *
 * Events listened:
 * - ui:tutorialShow
 * - ui:tutorialHide
 * - input:action
 */

import { EventBus } from '../core/EventBus';

/**
 * Tutorial prompt configuration
 */
export interface TutorialConfig {
  // Position
  bottom: number;

  // Timing
  showDuration: number;
  hideDuration: number;
  autoHideDelay: number;

  // Colors
  textColor: string;
  actionColor: string;
  backgroundColor: string;
}

const DEFAULT_CONFIG: TutorialConfig = {
  bottom: 200,

  showDuration: 300,
  hideDuration: 300,
  autoHideDelay: 5000,

  textColor: '#ffffff',
  actionColor: '#d4a54a',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
};

/**
 * Key display mapping
 */
const KEY_DISPLAY: Record<string, string> = {
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  Enter: 'ENTER',
  Escape: 'ESC',
  Tab: 'TAB',
  KeyW: 'W',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyE: 'E',
  KeyQ: 'Q',
  KeyR: 'R',
  KeyF: 'F',
  MouseLeft: 'LEFT CLICK',
  MouseRight: 'RIGHT CLICK',
  MouseMiddle: 'MIDDLE CLICK',
};

/**
 * Predefined tutorial messages
 */
export const TUTORIAL_MESSAGES = {
  ROLL: {
    message: 'Roll to evade enemy attacks',
    action: 'Space',
  },
  ATTACK: {
    message: 'Attack with your weapon',
    action: 'MouseLeft',
  },
  STRONG_ATTACK: {
    message: 'Perform a strong attack',
    action: 'ShiftLeft + MouseLeft',
  },
  BLOCK: {
    message: 'Raise your shield to block',
    action: 'MouseRight',
  },
  LOCK_ON: {
    message: 'Lock on to your target',
    action: 'Tab',
  },
  HEAL: {
    message: 'Use Estus Flask to heal',
    action: 'KeyR',
  },
  INTERACT: {
    message: 'Interact',
    action: 'KeyE',
  },
  MOVEMENT: {
    message: 'Move around',
    action: 'W A S D',
  },
  PLUNGE: {
    message: 'Perform a plunging attack while falling',
    action: 'MouseLeft (while airborne)',
  },
};

/**
 * TutorialPrompts class
 */
class TutorialPromptsClass {
  private container: HTMLElement | null = null;
  private messageElement: HTMLElement | null = null;
  private actionElement: HTMLElement | null = null;

  private config: TutorialConfig = DEFAULT_CONFIG;
  private unsubscribers: (() => void)[] = [];

  private visible: boolean = false;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private currentAction: string | null = null;

  private queue: Array<{ message: string; action?: string }> = [];
  private isProcessingQueue: boolean = false;

  /**
   * Initialize tutorial prompts
   */
  init(config?: Partial<TutorialConfig>): void {
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
    this.container.id = 'tutorial-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: ${this.config.bottom}px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1001;
      pointer-events: none;
      font-family: 'Cinzel', serif;
      text-align: center;
      opacity: 0;
      transition: opacity ${this.config.showDuration}ms ease;
    `;

    // Background box
    const box = document.createElement('div');
    box.style.cssText = `
      background: ${this.config.backgroundColor};
      padding: 15px 40px;
      border: 1px solid rgba(212, 165, 74, 0.3);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    `;

    // Message
    this.messageElement = document.createElement('div');
    this.messageElement.style.cssText = `
      color: ${this.config.textColor};
      font-size: 1.1rem;
      letter-spacing: 0.1em;
      margin-bottom: 8px;
    `;

    // Action hint
    this.actionElement = document.createElement('div');
    this.actionElement.style.cssText = `
      color: ${this.config.actionColor};
      font-size: 0.9rem;
      letter-spacing: 0.2em;
    `;

    box.appendChild(this.messageElement);
    box.appendChild(this.actionElement);
    this.container.appendChild(box);

    document.body.appendChild(this.container);
  }

  /**
   * Subscribe to EventBus events
   */
  private subscribeEvents(): void {
    this.unsubscribers.push(
      EventBus.on('ui:tutorialShow', (data) => {
        this.show(data.message, data.action);
      })
    );

    this.unsubscribers.push(
      EventBus.on('ui:tutorialHide', () => {
        this.hide();
      })
    );

    this.unsubscribers.push(
      EventBus.on('input:action', (data) => {
        if (this.currentAction && data.action === this.currentAction && data.pressed) {
          this.hide();
        }
      })
    );
  }

  /**
   * Show tutorial prompt
   */
  show(message: string, action?: string): void {
    // If already showing, queue this message
    if (this.visible) {
      this.queue.push({ message, action });
      return;
    }

    if (this.messageElement) {
      this.messageElement.textContent = message;
    }

    if (this.actionElement) {
      if (action) {
        const displayAction = this.formatAction(action);
        this.actionElement.textContent = `[ ${displayAction} ]`;
        this.actionElement.style.display = 'block';
        this.currentAction = action;
      } else {
        this.actionElement.style.display = 'none';
        this.currentAction = null;
      }
    }

    if (this.container) {
      this.container.style.opacity = '1';
    }

    this.visible = true;

    // Auto-hide after delay
    this.startAutoHideTimer();
  }

  /**
   * Show predefined tutorial message
   */
  showPredefined(key: keyof typeof TUTORIAL_MESSAGES): void {
    const tutorial = TUTORIAL_MESSAGES[key];
    this.show(tutorial.message, tutorial.action);
  }

  /**
   * Format action key for display
   */
  private formatAction(action: string): string {
    // Handle combined keys (e.g., "ShiftLeft + MouseLeft")
    const parts = action.split(' + ');
    const formatted = parts.map((part) => {
      const trimmed = part.trim();
      return KEY_DISPLAY[trimmed] || trimmed.toUpperCase();
    });
    return formatted.join(' + ');
  }

  /**
   * Start auto-hide timer
   */
  private startAutoHideTimer(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
    }

    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, this.config.autoHideDelay);
  }

  /**
   * Hide tutorial prompt
   */
  hide(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }

    if (this.container) {
      this.container.style.transition = `opacity ${this.config.hideDuration}ms ease`;
      this.container.style.opacity = '0';
    }

    this.visible = false;
    this.currentAction = null;

    // Process queued messages
    setTimeout(() => {
      this.processQueue();
    }, this.config.hideDuration);
  }

  /**
   * Process queued messages
   */
  private processQueue(): void {
    if (this.isProcessingQueue || this.queue.length === 0) return;

    this.isProcessingQueue = true;

    const next = this.queue.shift();
    if (next) {
      this.show(next.message, next.action);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Clear all queued messages
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Check if visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Destroy tutorial prompts
   */
  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.messageElement = null;
    this.actionElement = null;
    this.queue = [];
  }
}

// Singleton instance
export const TutorialPrompts = new TutorialPromptsClass();

/**
 * Helper: Show a sequence of tutorial messages
 */
export async function showTutorialSequence(
  tutorials: Array<{ message: string; action?: string; delay?: number }>
): Promise<void> {
  for (const tutorial of tutorials) {
    TutorialPrompts.show(tutorial.message, tutorial.action);

    // Wait for specified delay or default auto-hide delay
    await new Promise<void>((resolve) => {
      setTimeout(resolve, tutorial.delay ?? DEFAULT_CONFIG.autoHideDelay + 500);
    });
  }
}
