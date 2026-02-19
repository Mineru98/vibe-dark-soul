# UI/UX 시스템 구현 계획서 (UI/UX Systems Implementation Plan)

## 문서 정보
- **작성일**: 2026-02-18
- **작성 기준**: PRD.md 섹션 6.3, 8.2, 9
- **현재 프로젝트 상태**: 타이틀 화면 구현 완료 (Menu.ts 존재)

---

## 개요

이 문서는 PRD.md의 섹션 9(UI/UX), 섹션 6.3(주인공 대사 시스템), 섹션 8.2(보스 아레나 요구사항)를 기반으로, Soulslike 게임의 UI/UX 시스템을 three.js + HTML/CSS 오버레이 환경에서 구현하기 위한 상세 계획을 제공합니다.

### 핵심 설계 원칙 (PRD 섹션 2 참조)
> "UI는 최소, 피드백은 강하게: HUD는 간결(HP/스태미나/락온 정도). 대신 사운드/카메라 흔들림/히트스톱 등 감각 피드백이 중요."

---

## 1. 아키텍처 개요 (src/ui/ 디렉터리 구조)

### 1.1 현재 구조 분석

```
src/ui/
└── Menu.ts          # 타이틀 화면 메뉴 UI (이벤트 기반)
```

### 1.2 목표 구조

```
src/ui/
├── Menu.ts                    # (기존) 타이틀 화면 메뉴
├── UIManager.ts               # UI 시스템 통합 관리자
├── UIConfig.ts                # UI 설정/상수 정의
│
├── hud/                       # HUD 컴포넌트
│   ├── HUD.ts                 # HUD 컨테이너 (통합 관리)
│   ├── HealthBar.ts           # HP 바
│   ├── StaminaBar.ts          # 스태미나 바
│   └── LockOnIndicator.ts     # 락온 타겟 표시
│
├── boss/                      # 보스전 UI
│   ├── BossUI.ts              # 보스 UI 컨테이너
│   ├── BossHealthBar.ts       # 보스 체력 바
│   └── BossNameplate.ts       # 보스 이름 표시
│
├── prompt/                    # 상호작용 프롬프트
│   ├── InteractionPrompt.ts   # 상호작용 프롬프트
│   └── TutorialMessage.ts     # 튜토리얼 바닥 메시지
│
├── dialogue/                  # 대사/자막 시스템
│   ├── DialogueSystem.ts      # 대사 시스템 관리자
│   ├── SubtitleDisplay.ts     # 자막 표시 컴포넌트
│   └── data/
│       └── dialogue.json      # 대사 데이터
│
└── components/                # 공용 UI 컴포넌트
    ├── UIComponent.ts         # UI 컴포넌트 기반 클래스
    ├── AnimatedBar.ts         # 애니메이션 바 (HP/스태미나 공용)
    └── FadeOverlay.ts         # 페이드 인/아웃 오버레이
```

---

## 2. HUD 시스템 (HP/스태미나 바)

### 2.1 개요 (PRD 섹션 9.1 참조)

> "좌상단: HP 바(빨강 계열), Stamina 바(초록 계열) — 색은 고정할 필요 없고 구분만 되면 됨."

### 2.2 UI 설정

```typescript
// src/ui/UIConfig.ts

export const UI_CONFIG = {
  // HUD 위치
  hud: {
    position: 'top-left',
    padding: 20,                 // 화면 가장자리 여백 (px)
    barWidth: 200,               // 바 너비 (px)
    barHeight: 12,               // 바 높이 (px)
    barGap: 8,                   // 바 사이 간격 (px)
    barBorderRadius: 2,          // 바 모서리 둥글기 (px)
  },

  // 색상 테마 (다크 소울 스타일)
  colors: {
    hp: {
      fill: '#8B0000',           // 진한 빨강
      background: '#2a0a0a',     // 어두운 배경
      border: '#4a1a1a',         // 테두리
      damage: '#ff4444',         // 피해 시 플래시
    },
    stamina: {
      fill: '#228B22',           // 포레스트 그린
      background: '#0a2a0a',
      border: '#1a4a1a',
      depleted: '#666666',       // 고갈 시 색상
    },
    boss: {
      fill: '#d4a54a',           // 골드
      background: '#1a1510',
      border: '#3d2f20',
      name: '#d4a54a',           // 보스 이름 색상
    },
  },

  // 애니메이션
  animation: {
    barTransitionDuration: 0.15,  // 바 변화 애니메이션 (초)
    damageFlashDuration: 0.1,     // 피해 플래시 (초)
    fadeInDuration: 0.3,          // 페이드 인 (초)
    fadeOutDuration: 0.5,         // 페이드 아웃 (초)
  },

  // 폰트
  fonts: {
    primary: "'Cinzel', serif",   // 메인 폰트 (다크 소울 스타일)
    secondary: "'Georgia', serif",
  },

  // Z-Index
  zIndex: {
    hud: 100,
    bossUI: 110,
    prompt: 120,
    dialogue: 130,
    fade: 200,
  },
} as const;
```

### 2.3 UI 컴포넌트 기반 클래스

```typescript
// src/ui/components/UIComponent.ts

import { EventBus } from '../../core/EventBus';

export interface UIComponentConfig {
  id: string;
  parentSelector?: string;       // 기본: body
  className?: string;
  zIndex?: number;
  visible?: boolean;
}

export abstract class UIComponent {
  protected element: HTMLElement;
  protected config: UIComponentConfig;
  protected isVisible: boolean = false;

  constructor(config: UIComponentConfig) {
    this.config = config;
    this.element = this.createElement();
    this.mount();
  }

  protected abstract createElement(): HTMLElement;

  protected mount(): void {
    const parent = this.config.parentSelector
      ? document.querySelector(this.config.parentSelector)
      : document.body;

    if (parent) {
      parent.appendChild(this.element);
    }
  }

  show(animate: boolean = true): void {
    if (this.isVisible) return;
    this.isVisible = true;

    this.element.style.display = 'block';

    if (animate) {
      this.element.style.opacity = '0';
      requestAnimationFrame(() => {
        this.element.style.transition = 'opacity 0.3s ease';
        this.element.style.opacity = '1';
      });
    } else {
      this.element.style.opacity = '1';
    }
  }

  hide(animate: boolean = true): void {
    if (!this.isVisible) return;

    if (animate) {
      this.element.style.transition = 'opacity 0.5s ease';
      this.element.style.opacity = '0';
      setTimeout(() => {
        this.element.style.display = 'none';
        this.isVisible = false;
      }, 500);
    } else {
      this.element.style.display = 'none';
      this.element.style.opacity = '0';
      this.isVisible = false;
    }
  }

  destroy(): void {
    this.element.remove();
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
```

### 2.4 애니메이션 바 컴포넌트

```typescript
// src/ui/components/AnimatedBar.ts

import { UIComponent, UIComponentConfig } from './UIComponent';
import { UI_CONFIG } from '../UIConfig';

export interface AnimatedBarConfig extends UIComponentConfig {
  maxValue: number;
  currentValue: number;
  width: number;
  height: number;
  colors: {
    fill: string;
    background: string;
    border: string;
    damage?: string;
  };
  showDelayedDamage?: boolean;   // 지연 피해 표시 (빨간 바)
}

export class AnimatedBar extends UIComponent {
  private fillElement!: HTMLElement;
  private delayedFillElement!: HTMLElement | null;

  private maxValue: number;
  private currentValue: number;
  private displayValue: number;
  private delayedValue: number;

  private barConfig: AnimatedBarConfig;

  constructor(config: AnimatedBarConfig) {
    super(config);
    this.barConfig = config;
    this.maxValue = config.maxValue;
    this.currentValue = config.currentValue;
    this.displayValue = config.currentValue;
    this.delayedValue = config.currentValue;
  }

  protected createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = this.config.id;
    container.className = this.config.className || 'animated-bar';

    const { width, height, colors, showDelayedDamage } = this.barConfig;

    container.style.cssText = `
      width: ${width}px;
      height: ${height}px;
      background-color: ${colors.background};
      border: 1px solid ${colors.border};
      border-radius: ${UI_CONFIG.hud.barBorderRadius}px;
      position: relative;
      overflow: hidden;
    `;

    // 지연 피해 바 (빨간색, 뒤에 표시)
    if (showDelayedDamage && colors.damage) {
      this.delayedFillElement = document.createElement('div');
      this.delayedFillElement.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 100%;
        background-color: ${colors.damage};
        transition: width 0.5s ease-out;
      `;
      container.appendChild(this.delayedFillElement);
    }

    // 메인 채움 바
    this.fillElement = document.createElement('div');
    this.fillElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background-color: ${colors.fill};
      transition: width ${UI_CONFIG.animation.barTransitionDuration}s ease-out;
    `;
    container.appendChild(this.fillElement);

    return container;
  }

  setValue(value: number, animate: boolean = true): void {
    const previousValue = this.currentValue;
    this.currentValue = Math.max(0, Math.min(this.maxValue, value));

    const percentage = (this.currentValue / this.maxValue) * 100;

    if (animate) {
      this.fillElement.style.width = `${percentage}%`;

      if (this.delayedFillElement && this.currentValue < previousValue) {
        const delayedPercentage = (previousValue / this.maxValue) * 100;
        this.delayedFillElement.style.width = `${delayedPercentage}%`;

        setTimeout(() => {
          if (this.delayedFillElement) {
            this.delayedFillElement.style.width = `${percentage}%`;
          }
        }, 500);
      }
    } else {
      this.fillElement.style.transition = 'none';
      this.fillElement.style.width = `${percentage}%`;

      if (this.delayedFillElement) {
        this.delayedFillElement.style.transition = 'none';
        this.delayedFillElement.style.width = `${percentage}%`;
      }

      requestAnimationFrame(() => {
        this.fillElement.style.transition = `width ${UI_CONFIG.animation.barTransitionDuration}s ease-out`;
        if (this.delayedFillElement) {
          this.delayedFillElement.style.transition = 'width 0.5s ease-out';
        }
      });
    }
  }

  setMaxValue(value: number): void {
    this.maxValue = value;
    this.setValue(this.currentValue, false);
  }

  flash(color: string, duration: number = UI_CONFIG.animation.damageFlashDuration): void {
    const originalColor = this.barConfig.colors.fill;
    this.fillElement.style.backgroundColor = color;

    setTimeout(() => {
      this.fillElement.style.backgroundColor = originalColor;
    }, duration * 1000);
  }
}
```

### 2.5 HP 바 구현

```typescript
// src/ui/hud/HealthBar.ts

import { AnimatedBar, AnimatedBarConfig } from '../components/AnimatedBar';
import { EventBus } from '../../core/EventBus';
import { UI_CONFIG } from '../UIConfig';

export class HealthBar extends AnimatedBar {
  constructor(maxHP: number = 100) {
    const config: AnimatedBarConfig = {
      id: 'player-health-bar',
      className: 'health-bar',
      maxValue: maxHP,
      currentValue: maxHP,
      width: UI_CONFIG.hud.barWidth,
      height: UI_CONFIG.hud.barHeight,
      colors: UI_CONFIG.colors.hp,
      showDelayedDamage: true,
      zIndex: UI_CONFIG.zIndex.hud,
    };

    super(config);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    EventBus.on('player:damaged', (data: { amount: number; currentHP: number }) => {
      this.setValue(data.currentHP);
      this.flash(UI_CONFIG.colors.hp.damage);
    });

    EventBus.on('player:healed', (data: { amount: number; currentHP: number }) => {
      this.setValue(data.currentHP);
    });

    EventBus.on('player:hp_sync', (data: { current: number; max: number }) => {
      this.setMaxValue(data.max);
      this.setValue(data.current, false);
    });
  }
}
```

### 2.6 스태미나 바 구현

```typescript
// src/ui/hud/StaminaBar.ts

import { AnimatedBar, AnimatedBarConfig } from '../components/AnimatedBar';
import { EventBus } from '../../core/EventBus';
import { UI_CONFIG } from '../UIConfig';

export class StaminaBar extends AnimatedBar {
  private isExhausted: boolean = false;

  constructor(maxStamina: number = 100) {
    const config: AnimatedBarConfig = {
      id: 'player-stamina-bar',
      className: 'stamina-bar',
      maxValue: maxStamina,
      currentValue: maxStamina,
      width: UI_CONFIG.hud.barWidth,
      height: UI_CONFIG.hud.barHeight,
      colors: UI_CONFIG.colors.stamina,
      showDelayedDamage: false,
      zIndex: UI_CONFIG.zIndex.hud,
    };

    super(config);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    EventBus.on('stamina:changed', (data: { current: number; max: number; percentage: number }) => {
      this.setValue(data.current);
    });

    EventBus.on('stamina:exhausted', () => {
      this.setExhausted(true);
    });

    EventBus.on('stamina:recovered', () => {
      this.setExhausted(false);
    });
  }

  private setExhausted(exhausted: boolean): void {
    this.isExhausted = exhausted;

    const fillElement = this.getElement().querySelector('div:last-child') as HTMLElement;
    if (fillElement) {
      fillElement.style.backgroundColor = exhausted
        ? UI_CONFIG.colors.stamina.depleted
        : UI_CONFIG.colors.stamina.fill;
    }
  }
}
```

---

## 3. 락온 표시 UI

### 3.1 개요 (PRD 섹션 9.1 참조)

> "중앙: 락온 타겟 표시(원/점) + 타겟 전환 힌트(휠)."

### 3.2 락온 인디케이터 구현

```typescript
// src/ui/hud/LockOnIndicator.ts

import { UIComponent } from '../components/UIComponent';
import { EventBus } from '../../core/EventBus';
import { UI_CONFIG } from '../UIConfig';
import * as THREE from 'three';

export interface LockOnTarget {
  id: string;
  position: THREE.Vector3;
  name?: string;
}

export class LockOnIndicator extends UIComponent {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentTarget: LockOnTarget | null = null;
  private camera: THREE.Camera | null = null;

  private rotationAngle: number = 0;
  private pulseScale: number = 1;
  private isAnimating: boolean = false;

  constructor() {
    super({
      id: 'lock-on-indicator',
      className: 'lock-on-indicator',
      zIndex: UI_CONFIG.zIndex.hud + 1,
    });

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;

    this.setupCanvas();
    this.setupEventListeners();
  }

  protected createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = this.config.id;
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: ${UI_CONFIG.zIndex.hud + 1};
      display: none;
    `;
    return container;
  }

  private setupCanvas(): void {
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    `;
    this.element.appendChild(this.canvas);

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private setupEventListeners(): void {
    EventBus.on('camera:locked_on', (data: { target: THREE.Object3D }) => {
      this.setTarget({
        id: data.target.userData.entityId || 'unknown',
        position: data.target.position,
        name: data.target.userData.name,
      });
    });

    EventBus.on('camera:lock_off', () => {
      this.clearTarget();
    });

    EventBus.on('camera:initialized', (camera: THREE.Camera) => {
      this.camera = camera;
    });
  }

  setTarget(target: LockOnTarget): void {
    this.currentTarget = target;
    this.show(false);
    this.isAnimating = true;
    this.animate();
  }

  clearTarget(): void {
    this.currentTarget = null;
    this.isAnimating = false;
    this.hide(true);
  }

  private animate(): void {
    if (!this.isAnimating || !this.currentTarget || !this.camera) return;

    this.rotationAngle += 0.02;
    this.pulseScale = 1 + Math.sin(Date.now() * 0.005) * 0.1;

    this.render();
    requestAnimationFrame(() => this.animate());
  }

  private render(): void {
    if (!this.currentTarget || !this.camera) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const screenPos = this.worldToScreen(this.currentTarget.position);
    if (!screenPos) return;

    const { x, y } = screenPos;
    const baseSize = 40;
    const size = baseSize * this.pulseScale;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(this.rotationAngle);

    this.ctx.strokeStyle = UI_CONFIG.colors.boss.fill;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < 4; i++) {
      const startAngle = (i * Math.PI / 2) + Math.PI / 8;
      const endAngle = startAngle + Math.PI / 4;
      this.ctx.arc(0, 0, size, startAngle, endAngle);
      this.ctx.moveTo(0, 0);
    }
    this.ctx.stroke();

    this.ctx.fillStyle = UI_CONFIG.colors.boss.fill;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private worldToScreen(worldPos: THREE.Vector3): { x: number; y: number } | null {
    if (!this.camera) return null;

    const vector = worldPos.clone();
    vector.project(this.camera);

    if (vector.z > 1) return null;

    const x = (vector.x + 1) / 2 * this.canvas.width;
    const y = (1 - vector.y) / 2 * this.canvas.height;

    return { x, y };
  }

  show(animate: boolean = true): void {
    super.show(animate);
    this.element.style.display = 'block';
  }
}
```

---

## 4. 상호작용 프롬프트 시스템

### 4.1 개요 (PRD 섹션 9.1 참조)

> "상호작용 프롬프트: 오브젝트 근처에서 '[키] 상호작용' 표시."

### 4.2 상호작용 프롬프트 구현

```typescript
// src/ui/prompt/InteractionPrompt.ts

import { UIComponent } from '../components/UIComponent';
import { EventBus } from '../../core/EventBus';
import { UI_CONFIG } from '../UIConfig';

export interface InteractionData {
  key: string;
  action: string;
  objectName?: string;
}

export class InteractionPrompt extends UIComponent {
  private keyElement!: HTMLElement;
  private actionElement!: HTMLElement;
  private currentData: InteractionData | null = null;

  constructor() {
    super({
      id: 'interaction-prompt',
      className: 'interaction-prompt',
      zIndex: UI_CONFIG.zIndex.prompt,
    });

    this.setupEventListeners();
  }

  protected createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = this.config.id;

    container.style.cssText = `
      position: fixed;
      bottom: 30%;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: row;
      align-items: center;
      gap: 12px;
      padding: 12px 24px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid rgba(212, 165, 74, 0.5);
      border-radius: 4px;
      z-index: ${UI_CONFIG.zIndex.prompt};
    `;

    this.keyElement = document.createElement('div');
    this.keyElement.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      height: 36px;
      padding: 0 8px;
      background: rgba(212, 165, 74, 0.2);
      border: 2px solid ${UI_CONFIG.colors.boss.fill};
      border-radius: 4px;
      font-family: ${UI_CONFIG.fonts.primary};
      font-size: 16px;
      font-weight: bold;
      color: ${UI_CONFIG.colors.boss.fill};
      text-transform: uppercase;
    `;
    container.appendChild(this.keyElement);

    this.actionElement = document.createElement('div');
    this.actionElement.style.cssText = `
      font-family: ${UI_CONFIG.fonts.primary};
      font-size: 14px;
      color: #ffffff;
      letter-spacing: 0.1em;
    `;
    container.appendChild(this.actionElement);

    return container;
  }

  private setupEventListeners(): void {
    EventBus.on('interaction:available', (data: InteractionData) => {
      this.showPrompt(data);
    });

    EventBus.on('interaction:unavailable', () => {
      this.hidePrompt();
    });
  }

  showPrompt(data: InteractionData): void {
    this.currentData = data;

    this.keyElement.textContent = data.key;
    this.actionElement.textContent = data.objectName
      ? `${data.action}: ${data.objectName}`
      : data.action;

    this.show(true);
    this.element.style.display = 'flex';
  }

  hidePrompt(): void {
    this.currentData = null;
    this.hide(true);
  }
}
```

---

## 5. 보스 체력바/이름 UI

### 5.1 개요 (PRD 섹션 8.2, 9.1 참조)

> "보스전: 하단에 보스 이름 + HP 바."

### 5.2 보스 UI 컴포넌트

```typescript
// src/ui/boss/BossUI.ts

import { UIComponent } from '../components/UIComponent';
import { BossHealthBar } from './BossHealthBar';
import { BossNameplate } from './BossNameplate';
import { EventBus } from '../../core/EventBus';
import { UI_CONFIG } from '../UIConfig';

export interface BossData {
  id: string;
  name: string;
  maxHP: number;
  currentHP: number;
  title?: string;
}

export class BossUI extends UIComponent {
  private nameplate: BossNameplate;
  private healthBar: BossHealthBar;
  private currentBoss: BossData | null = null;

  constructor() {
    super({
      id: 'boss-ui',
      className: 'boss-ui-container',
      zIndex: UI_CONFIG.zIndex.bossUI,
    });

    this.nameplate = new BossNameplate();
    this.healthBar = new BossHealthBar();

    this.mountChildren();
    this.setupEventListeners();
  }

  protected createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = this.config.id;

    container.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: ${UI_CONFIG.zIndex.bossUI};
    `;

    return container;
  }

  private mountChildren(): void {
    this.element.appendChild(this.nameplate.getElement());
    this.element.appendChild(this.healthBar.getElement());
  }

  private setupEventListeners(): void {
    EventBus.on('boss:fight_start', (data: BossData) => {
      this.showBossUI(data);
    });

    EventBus.on('boss:fight_end', () => {
      this.hideBossUI();
    });

    EventBus.on('boss:damaged', (data: { currentHP: number; damage: number }) => {
      if (this.currentBoss) {
        this.currentBoss.currentHP = data.currentHP;
        this.healthBar.setValue(data.currentHP);
      }
    });

    EventBus.on('boss:defeated', () => {
      setTimeout(() => {
        this.hideBossUI();
      }, 2000);
    });
  }

  showBossUI(data: BossData): void {
    this.currentBoss = data;

    this.nameplate.setName(data.name, data.title);
    this.healthBar.setMaxValue(data.maxHP);
    this.healthBar.setValue(data.currentHP, false);

    this.show(true);
    this.element.style.display = 'flex';
  }

  hideBossUI(): void {
    this.currentBoss = null;
    this.hide(true);
  }

  destroy(): void {
    this.nameplate.destroy();
    this.healthBar.destroy();
    super.destroy();
  }
}
```

---

## 6. 대사/자막 시스템 (트리거 기반)

### 6.1 개요 (PRD 섹션 6.3 참조)

> "대사 정의는 JSON/CSV로 데이터화(이벤트 키, 조건, 우선순위, 쿨다운, 자막, 음성 파일 경로)."

### 6.2 대사 데이터 구조

```typescript
// src/ui/dialogue/types.ts

export interface DialogueLine {
  id: string;
  trigger: DialogueTrigger;
  subtitle: string;
  subtitleEn?: string;
  voice?: string;
  duration?: number;
  cooldownSec: number;
  priority: number;
  conditions?: DialogueCondition[];
}

export type DialogueTrigger =
  | 'ON_GAME_START'
  | 'ON_INTERACT_WAKE'
  | 'ON_FIRST_WEAPON'
  | 'ON_FIRST_ENEMY'
  | 'ON_STAMINA_DEPLETED'
  | 'ON_BOSS_REVEAL'
  | 'ON_CHECKPOINT_ACTIVATE'
  | 'ON_BOSS_ARENA_ENTER'
  | 'ON_LOW_HP'
  | 'ON_PLAYER_DEATH'
  | 'ON_BOSS_DEFEATED'
  | string;

export interface DialogueCondition {
  type: 'hp_below' | 'hp_above' | 'has_item' | 'boss_phase' | 'first_time';
  value?: number | string | boolean;
}
```

### 6.3 대사 데이터 예시 (dialogue.json)

```json
{
  "version": "1.0",
  "locale": "ko-KR",
  "lines": [
    {
      "id": "player_start_wake",
      "trigger": "ON_INTERACT_WAKE",
      "subtitle": "…여긴 어디지? 몸이… 무겁다.",
      "duration": 3.5,
      "cooldownSec": 999999,
      "priority": 10
    },
    {
      "id": "boss_first_appear",
      "trigger": "ON_BOSS_REVEAL",
      "subtitle": "저건… 싸우면 안 돼. 지금은 도망쳐!",
      "voice": "sfx/voice/player_boss_reveal.ogg",
      "duration": 3.5,
      "cooldownSec": 999999,
      "priority": 10
    },
    {
      "id": "checkpoint_activate",
      "trigger": "ON_CHECKPOINT_ACTIVATE",
      "subtitle": "이 불빛… 이상하게 안전해.",
      "duration": 3.0,
      "cooldownSec": 999999,
      "priority": 8
    },
    {
      "id": "player_death",
      "trigger": "ON_PLAYER_DEATH",
      "subtitle": "…다시. 이번엔 배운 대로.",
      "duration": 3.0,
      "cooldownSec": 10,
      "priority": 10
    }
  ]
}
```

### 6.4 자막 표시 컴포넌트

```typescript
// src/ui/dialogue/SubtitleDisplay.ts

import { UIComponent } from '../components/UIComponent';
import { UI_CONFIG } from '../UIConfig';

export class SubtitleDisplay extends UIComponent {
  private textElement!: HTMLElement;

  constructor() {
    super({
      id: 'subtitle-display',
      className: 'subtitle-display',
      zIndex: UI_CONFIG.zIndex.dialogue,
    });
  }

  protected createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = this.config.id;

    container.style.cssText = `
      position: fixed;
      bottom: 15%;
      left: 50%;
      transform: translateX(-50%);
      max-width: 80%;
      padding: 16px 32px;
      background: rgba(0, 0, 0, 0.75);
      border-left: 3px solid ${UI_CONFIG.colors.boss.fill};
      z-index: ${UI_CONFIG.zIndex.dialogue};
      display: none;
    `;

    this.textElement = document.createElement('div');
    this.textElement.style.cssText = `
      font-family: ${UI_CONFIG.fonts.primary};
      font-size: 16px;
      line-height: 1.6;
      color: #ffffff;
      text-align: center;
      letter-spacing: 0.05em;
    `;

    container.appendChild(this.textElement);

    return container;
  }

  show(text: string, animate: boolean = true): void {
    this.textElement.textContent = text;
    this.element.style.display = 'block';

    if (animate) {
      this.element.style.opacity = '0';
      this.element.style.transform = 'translateX(-50%) translateY(10px)';

      requestAnimationFrame(() => {
        this.element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        this.element.style.opacity = '1';
        this.element.style.transform = 'translateX(-50%) translateY(0)';
      });
    }

    this.isVisible = true;
  }

  hide(animate: boolean = true): void {
    if (!this.isVisible) return;

    if (animate) {
      this.element.style.transition = 'opacity 0.5s ease';
      this.element.style.opacity = '0';

      setTimeout(() => {
        this.element.style.display = 'none';
        this.isVisible = false;
      }, 500);
    } else {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }
}
```

---

## 7. 튜토리얼 메시지 ('바닥 메시지' 스타일)

### 7.1 개요 (PRD 섹션 9.2 참조)

> "가까이 가면 프롬프트 표시(예: 'E: 읽기')."
> "읽으면 화면 하단에 1~2줄 텍스트(예: '락온으로 적을 고정하라')."

### 7.2 튜토리얼 메시지 컴포넌트

```typescript
// src/ui/prompt/TutorialMessage.ts

import { UIComponent } from '../components/UIComponent';
import { EventBus } from '../../core/EventBus';
import { UI_CONFIG } from '../UIConfig';

export interface TutorialMessageData {
  id: string;
  title?: string;
  content: string;
  keyHint?: string;
  duration?: number;
}

export class TutorialMessage extends UIComponent {
  private titleElement!: HTMLElement;
  private contentElement!: HTMLElement;
  private keyHintElement!: HTMLElement;
  private closeHintElement!: HTMLElement;

  constructor() {
    super({
      id: 'tutorial-message',
      className: 'tutorial-message',
      zIndex: UI_CONFIG.zIndex.prompt + 5,
    });

    this.setupEventListeners();
  }

  protected createElement(): HTMLElement {
    const container = document.createElement('div');
    container.id = this.config.id;

    container.style.cssText = `
      position: fixed;
      bottom: 20%;
      left: 50%;
      transform: translateX(-50%);
      max-width: 500px;
      min-width: 300px;
      padding: 24px 32px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(212, 165, 74, 0.6);
      border-radius: 2px;
      z-index: ${UI_CONFIG.zIndex.prompt + 5};
      display: none;
    `;

    this.titleElement = document.createElement('div');
    this.titleElement.style.cssText = `
      font-family: ${UI_CONFIG.fonts.primary};
      font-size: 18px;
      font-weight: 600;
      color: ${UI_CONFIG.colors.boss.fill};
      text-align: center;
      margin-bottom: 12px;
      letter-spacing: 0.1em;
      display: none;
    `;
    container.appendChild(this.titleElement);

    this.contentElement = document.createElement('div');
    this.contentElement.style.cssText = `
      font-family: ${UI_CONFIG.fonts.secondary};
      font-size: 14px;
      line-height: 1.8;
      color: #e0e0e0;
      text-align: center;
      white-space: pre-line;
    `;
    container.appendChild(this.contentElement);

    this.keyHintElement = document.createElement('div');
    this.keyHintElement.style.cssText = `
      font-family: ${UI_CONFIG.fonts.secondary};
      font-size: 12px;
      color: rgba(212, 165, 74, 0.8);
      text-align: center;
      margin-top: 12px;
      display: none;
    `;
    container.appendChild(this.keyHintElement);

    this.closeHintElement = document.createElement('div');
    this.closeHintElement.style.cssText = `
      font-family: ${UI_CONFIG.fonts.secondary};
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
      margin-top: 16px;
    `;
    this.closeHintElement.textContent = '아무 키나 누르면 닫힘';
    container.appendChild(this.closeHintElement);

    return container;
  }

  private setupEventListeners(): void {
    EventBus.on('tutorial:show', (data: TutorialMessageData) => {
      this.showMessage(data);
    });

    document.addEventListener('keydown', () => {
      if (this.isVisible) {
        this.hideMessage();
      }
    });
  }

  showMessage(data: TutorialMessageData, pauseGame: boolean = true): void {
    if (data.title) {
      this.titleElement.textContent = data.title;
      this.titleElement.style.display = 'block';
    } else {
      this.titleElement.style.display = 'none';
    }

    this.contentElement.textContent = data.content;

    if (data.keyHint) {
      this.keyHintElement.textContent = data.keyHint;
      this.keyHintElement.style.display = 'block';
    } else {
      this.keyHintElement.style.display = 'none';
    }

    this.show(true);
    this.element.style.display = 'block';

    if (pauseGame) {
      EventBus.emit('game:pause');
    }
  }

  hideMessage(): void {
    this.hide(true);
    EventBus.emit('game:resume');
  }
}
```

---

## 8. 기존 Menu.ts와의 통합 방안

### 8.1 UIManager 통합

```typescript
// src/ui/UIManager.ts

import { EventBus } from '../core/EventBus';
import { HUD } from './hud/HUD';
import { BossUI } from './boss/BossUI';
import { InteractionPrompt } from './prompt/InteractionPrompt';
import { TutorialMessage } from './prompt/TutorialMessage';
import { DialogueSystem } from './dialogue/DialogueSystem';
import { FadeOverlay } from './components/FadeOverlay';
import { initUI as initMenu } from './Menu';

export type GameUIState = 'title' | 'loading' | 'gameplay' | 'paused' | 'cutscene' | 'death';

export class UIManager {
  private static instance: UIManager;

  private hud: HUD | null = null;
  private bossUI: BossUI | null = null;
  private interactionPrompt: InteractionPrompt | null = null;
  private tutorialMessage: TutorialMessage | null = null;
  private dialogueSystem: DialogueSystem | null = null;
  private fadeOverlay: FadeOverlay | null = null;

  private currentState: GameUIState = 'title';

  private constructor() {}

  static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  initTitleScreen(intensityCallback: (intensity: number) => void): void {
    initMenu(intensityCallback);
    this.currentState = 'title';
  }

  initGameplayUI(): void {
    this.hideTitleUI();

    this.hud = new HUD();
    this.bossUI = new BossUI();
    this.interactionPrompt = new InteractionPrompt();
    this.tutorialMessage = new TutorialMessage();
    this.fadeOverlay = new FadeOverlay();

    this.currentState = 'gameplay';
    this.hud.show(true);
  }

  private hideTitleUI(): void {
    const title = document.getElementById('title');
    const menu = document.getElementById('main-menu');
    if (title) title.style.display = 'none';
    if (menu) menu.style.display = 'none';
  }

  setState(state: GameUIState): void {
    this.currentState = state;

    switch (state) {
      case 'gameplay':
        this.hud?.show(true);
        break;
      case 'cutscene':
        this.hud?.hide(true);
        this.bossUI?.hide(true);
        break;
      case 'death':
        this.hud?.hide(true);
        this.bossUI?.hide(true);
        break;
    }
  }

  destroy(): void {
    this.hud?.destroy();
    this.bossUI?.destroy();
    this.interactionPrompt?.destroy();
    this.tutorialMessage?.destroy();
    this.fadeOverlay?.destroy();
  }
}
```

---

## 9. 구현 순서 권장

| 순서 | 마일스톤 | 구현 내용 | 예상 소요 |
|------|----------|-----------|-----------|
| 1 | U1 | UI 기반 클래스 (UIComponent, UIConfig) | 0.5일 |
| 2 | U2 | AnimatedBar 컴포넌트 | 0.5일 |
| 3 | U3 | HUD (HP/스태미나 바) | 0.5일 |
| 4 | U4 | 락온 인디케이터 | 0.5일 |
| 5 | U5 | 상호작용 프롬프트 | 0.3일 |
| 6 | U6 | 보스 UI (체력바/이름) | 0.5일 |
| 7 | U7 | 자막/대사 시스템 | 1일 |
| 8 | U8 | 튜토리얼 메시지 | 0.5일 |
| 9 | U9 | UIManager 통합 | 0.5일 |
| 10 | U10 | 페이드/전환 효과 | 0.3일 |

**총 예상 소요: 약 5일**

---

## 10. 핵심 구현 파일

1. **src/ui/Menu.ts** - 기존 타이틀 화면 UI, 새 UI 시스템이 확장해야 할 패턴 제공
2. **src/core/EventBus.ts** - 모든 UI 컴포넌트가 의존하는 이벤트 버스 시스템
3. **src/combat/StaminaSystem.ts** - stamina:changed 이벤트 발행으로 HUD 연동
4. **docs/PRD.md** - 섹션 6.3, 8.2, 9에 UI/UX 요구사항 정의
5. **docs/implementation-plan-core-systems.md** - EventBus 구현이 UI 시스템의 전제 조건
