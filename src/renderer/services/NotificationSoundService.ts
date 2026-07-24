import digitalBellUrl from '../../../assets/sounds/digital-bell.wav?url';
import popUrl from '../../../assets/sounds/pop.wav?url';
import softBellUrl from '../../../assets/sounds/soft-bell.wav?url';
import zenChimeUrl from '../../../assets/sounds/zen-chime.wav?url';
import {
  DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  NOTIFICATION_SOUND_OPTIONS,
  type NotificationSoundEventType,
  type NotificationSoundId,
  type NotificationSoundSettings,
} from '../../shared/notificationSounds';

const PLAYBACK_COORDINATION_CHANNEL = 'ducky-notification-sounds';
const PLAYBACK_COORDINATION_MESSAGE = 'stop-current-playback';

const SOUND_ASSETS = {
  'soft-bell': softBellUrl,
  'digital-bell': digitalBellUrl,
  'zen-chime': zenChimeUrl,
  pop: popUrl,
} satisfies Record<NotificationSoundId, string>;

export class NotificationSoundService {
  private readonly audioBySound = new Map<
    NotificationSoundId,
    HTMLAudioElement
  >();
  private readonly coordinationChannel: BroadcastChannel | null;
  private settings: NotificationSoundSettings = {
    ...DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  };
  private currentAudio: HTMLAudioElement | null = null;
  private playbackRevision = 0;

  public constructor() {
    for (const option of NOTIFICATION_SOUND_OPTIONS) {
      const audio = new Audio(SOUND_ASSETS[option.id]);
      audio.loop = false;
      audio.preload = 'auto';
      audio.addEventListener('ended', () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
      });
      audio.load();
      this.audioBySound.set(option.id, audio);
    }

    this.coordinationChannel = this.createCoordinationChannel();
  }

  public configure(settings: NotificationSoundSettings): void {
    this.settings = { ...settings };

    if (!settings.enabled || settings.volume === 0) {
      this.stop();
    } else if (this.currentAudio !== null) {
      this.currentAudio.volume = settings.volume / 100;
    }
  }

  public play(eventType: NotificationSoundEventType): Promise<boolean> {
    return this.playSound(
      this.settings.sound,
      this.settings.volume,
      this.settings.enabled,
      eventType,
    );
  }

  public test(): Promise<boolean> {
    return this.playSound(
      this.settings.sound,
      this.settings.volume,
      this.settings.enabled,
      'reminder',
    );
  }

  public stop(): void {
    this.playbackRevision += 1;

    if (this.currentAudio === null) {
      return;
    }

    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.currentAudio = null;
  }

  private async playSound(
    sound: NotificationSoundId,
    volume: number,
    enabled: boolean,
    _eventType: NotificationSoundEventType,
  ): Promise<boolean> {
    if (!enabled || volume === 0) {
      return false;
    }

    const audio = this.audioBySound.get(sound);

    if (audio === undefined) {
      return false;
    }

    this.coordinationChannel?.postMessage(
      PLAYBACK_COORDINATION_MESSAGE,
    );
    this.stop();
    const playbackRevision = this.playbackRevision;
    audio.currentTime = 0;
    audio.volume = volume / 100;
    this.currentAudio = audio;

    try {
      await audio.play();

      if (
        playbackRevision !== this.playbackRevision ||
        this.currentAudio !== audio
      ) {
        audio.pause();
        audio.currentTime = 0;
        return false;
      }

      return true;
    } catch (error) {
      if (this.currentAudio === audio) {
        this.currentAudio = null;
      }

      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return false;
      }

      console.warn('[notification-sounds] playback_failed', error);
      return false;
    }
  }

  private createCoordinationChannel(): BroadcastChannel | null {
    try {
      const channel = new BroadcastChannel(
        PLAYBACK_COORDINATION_CHANNEL,
      );
      channel.addEventListener('message', (event) => {
        if (event.data === PLAYBACK_COORDINATION_MESSAGE) {
          this.stop();
        }
      });
      return channel;
    } catch {
      return null;
    }
  }
}

export const notificationSoundService =
  new NotificationSoundService();
