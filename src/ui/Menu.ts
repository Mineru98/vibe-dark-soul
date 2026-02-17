type IntensityCallback = (intensity: number) => void;

let onIntensityChange: IntensityCallback | null = null;
let clickSound: AudioContext | null = null;

export function initUI(intensityCallback: IntensityCallback): void {
  onIntensityChange = intensityCallback;

  const menuItems = document.querySelectorAll('.menu-item');

  menuItems.forEach((item) => {
    item.addEventListener('mouseenter', onMenuHover);
    item.addEventListener('mouseleave', onMenuLeave);
    item.addEventListener('click', onMenuClick);
  });

  // Initialize click sound context on first interaction
  document.addEventListener('click', initClickSound, { once: true });
}

function initClickSound(): void {
  try {
    clickSound = new AudioContext();
  } catch (e) {
    console.warn('Could not initialize click sound');
  }
}

function playClickSound(): void {
  if (!clickSound) return;

  try {
    const oscillator = clickSound.createOscillator();
    const gainNode = clickSound.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, clickSound.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, clickSound.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, clickSound.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, clickSound.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(clickSound.destination);

    oscillator.start(clickSound.currentTime);
    oscillator.stop(clickSound.currentTime + 0.1);
  } catch (e) {
    // Ignore sound errors
  }
}

function onMenuHover(event: Event): void {
  const target = event.target as HTMLElement;
  target.style.transform = 'translateX(10px)';

  // Increase fire intensity on hover
  if (onIntensityChange) {
    onIntensityChange(1.5);
  }

  playClickSound();
}

function onMenuLeave(event: Event): void {
  const target = event.target as HTMLElement;
  target.style.transform = 'translateX(0)';

  // Reset fire intensity
  if (onIntensityChange) {
    onIntensityChange(1.0);
  }
}

function onMenuClick(event: Event): void {
  const target = event.target as HTMLElement;
  const action = target.dataset.action;

  // Visual feedback
  target.style.color = '#fff';
  setTimeout(() => {
    target.style.color = '';
  }, 200);

  playClickSound();

  // Handle actions
  switch (action) {
    case 'new':
      console.log('New Journey selected');
      showMessage('A new journey begins...');
      break;
    case 'continue':
      console.log('Continue selected');
      showMessage('Continuing your journey...');
      break;
    case 'settings':
      console.log('Settings selected');
      showMessage('Settings (not implemented)');
      break;
    case 'quit':
      console.log('Quit selected');
      showMessage('Farewell, Ashen One...');
      break;
  }
}

function showMessage(text: string): void {
  // Create message element
  const message = document.createElement('div');
  message.textContent = text;
  message.style.cssText = `
    position: fixed;
    bottom: 20%;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Cinzel', serif;
    font-size: 1rem;
    color: #d4a54a;
    letter-spacing: 0.2em;
    opacity: 0;
    transition: opacity 0.5s ease;
    pointer-events: none;
    z-index: 100;
  `;

  document.body.appendChild(message);

  // Fade in
  requestAnimationFrame(() => {
    message.style.opacity = '1';
  });

  // Fade out and remove
  setTimeout(() => {
    message.style.opacity = '0';
    setTimeout(() => {
      message.remove();
    }, 500);
  }, 2000);
}
