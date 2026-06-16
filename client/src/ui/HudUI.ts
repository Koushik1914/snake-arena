import type { EventBus } from '../core/EventBus';

/**
 * HudUI — In-game HUD overlay controller.
 * Manages the live stats panel, leaderboard, latency display, and FPS counter.
 *
 * Separated from LobbyUI (which handles menus/death screen) for clean
 * separation of concerns.
 */
export class HudUI {
  private hudContainer:    HTMLElement;
  private hudRoomCode:     HTMLElement;
  private leaderboardList: HTMLElement;
  private statScore:       HTMLElement;
  private statRank:        HTMLElement;
  private statPing:        HTMLElement;
  private statFps:         HTMLElement;
  private boundaryWarning: HTMLElement;
  private warningSeconds:  HTMLElement;

  // FPS rolling average state
  private frameTimestamps: number[] = [];

  constructor(bus: EventBus) {
    this.hudContainer    = document.getElementById('hud-container')!;
    this.hudRoomCode     = document.getElementById('hud-room-code')!;
    this.leaderboardList = document.getElementById('leaderboard-list')!;
    this.statScore       = document.getElementById('stat-score')!;
    this.statRank        = document.getElementById('stat-rank')!;
    this.statPing        = document.getElementById('stat-ping')!;
    this.statFps         = document.getElementById('stat-fps')!;
    this.boundaryWarning = document.getElementById('boundary-warning')!;
    this.warningSeconds  = document.getElementById('warning-seconds')!;

    // Subscribe to latency updates from NetworkClient
    bus.on('latencyUpdate', ({ ms }) => {
      if (this.statPing) this.statPing.textContent = `${ms}ms`;
    });
  }

  /** Call once per frame to update the rolling FPS counter. */
  public tickFps(): void {
    const now = performance.now();
    this.frameTimestamps.push(now);
    // Keep only the last 60 frames
    if (this.frameTimestamps.length > 60) this.frameTimestamps.shift();
    if (this.frameTimestamps.length < 2) return;

    const elapsed = (now - this.frameTimestamps[0]) / 1000;
    const fps     = Math.round((this.frameTimestamps.length - 1) / elapsed);
    if (this.statFps) this.statFps.textContent = `${fps}fps`;
  }

  public show(roomCode: string): void {
    this.hudContainer.classList.remove('hidden');
    this.hudRoomCode.textContent = roomCode;
  }

  public hide(): void {
    this.hudContainer.classList.add('hidden');
  }

  public updatePlayerStats(score: number, rank: number, total: number): void {
    this.statScore.parentElement?.classList.remove('hidden');
    this.statRank.parentElement?.classList.remove('hidden');
    this.statScore.textContent = score.toString();
    this.statRank.textContent  = `${rank}/${total}`;
  }

  public hidePlayerStats(): void {
    this.statScore.parentElement?.classList.add('hidden');
    this.statRank.parentElement?.classList.add('hidden');
  }

  public updateLeaderboard(leaderboard: [string, number][], localName: string): void {
    this.leaderboardList.innerHTML = '';

    if (leaderboard.length === 0) {
      this.leaderboardList.innerHTML = '<div class="leaderboard-item empty">Waiting for snakes...</div>';
      return;
    }

    for (let i = 0; i < leaderboard.length; i++) {
      const [name, score] = leaderboard[i];
      const isLocal = name === localName;
      const item    = document.createElement('div');
      item.className = `leaderboard-item ${isLocal ? 'local' : ''}`;
      item.innerHTML = `
        <div class="rank-name">
          <span class="rank">${i + 1}</span>
          <span class="name">${this.escape(name)}</span>
        </div>
        <span class="score">${score}</span>
      `;
      this.leaderboardList.appendChild(item);
    }
  }

  public showBoundaryWarning(secondsLeft: number): void {
    this.boundaryWarning.classList.remove('hidden');
    this.warningSeconds.textContent = secondsLeft.toFixed(1);
  }

  public hideBoundaryWarning(): void {
    this.boundaryWarning.classList.add('hidden');
  }

  private escape(str: string): string {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }
}
