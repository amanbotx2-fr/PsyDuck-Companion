export interface AnimationRegistrationOptions {
  readonly fps?: number;
  readonly loop?: boolean;
}

export interface AnimationFolderRegistrationOptions
  extends AnimationRegistrationOptions {
  readonly getAnimationOptions?: (
    animationName: string,
  ) => AnimationRegistrationOptions | undefined;
}

export interface AnimationClip {
  readonly name: string;
  readonly frames: readonly string[];
  readonly fps: number;
  readonly loop: boolean;
}

export type AnimationFrameModules = Readonly<Record<string, string>>;

const DEFAULT_FPS = 12;
const DEFAULT_LOOP = true;

const normalizePath = (path: string): string =>
  path.replaceAll('\\', '/').replace(/\/+$/, '');

const framePathSorter = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

const validateAnimationName = (name: string): string => {
  if (name.length === 0 || name.trim() !== name) {
    throw new TypeError(
      'Animation names must be non-empty and cannot contain surrounding whitespace.',
    );
  }

  return name;
};

const validateFps = (fps: number): number => {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError('Animation FPS must be a finite number greater than zero.');
  }

  return fps;
};

export const loadAnimationFramesFromFolder = (
  folderPath: string,
  frameModules: AnimationFrameModules,
): readonly string[] => {
  const normalizedFolderPath = normalizePath(folderPath);

  if (normalizedFolderPath.length === 0) {
    throw new TypeError('An animation folder path must be provided.');
  }

  const frames = Object.entries(frameModules)
    .filter(([modulePath]) => {
      const normalizedModulePath = normalizePath(modulePath);
      const separatorIndex = normalizedModulePath.lastIndexOf('/');
      const moduleFolder = normalizedModulePath.slice(0, separatorIndex);

      return (
        moduleFolder === normalizedFolderPath ||
        moduleFolder.endsWith(`/${normalizedFolderPath}`)
      );
    })
    .sort(([leftPath], [rightPath]) =>
      framePathSorter.compare(normalizePath(leftPath), normalizePath(rightPath)),
    )
    .map(([, framePath]) => framePath);

  if (frames.length === 0) {
    throw new RangeError(
      `Animation folder "${folderPath}" does not contain any imported frames.`,
    );
  }

  return frames;
};

export class AnimationRegistry {
  private readonly clips = new Map<string, AnimationClip>();

  public get names(): readonly string[] {
    return [...this.clips.keys()];
  }

  public register(
    name: string,
    framePaths: readonly string[],
    options: AnimationRegistrationOptions = {},
  ): AnimationClip {
    const validatedName = validateAnimationName(name);

    if (framePaths.length === 0) {
      throw new RangeError('An animation must contain at least one frame.');
    }

    if (framePaths.some((framePath) => framePath.trim().length === 0)) {
      throw new TypeError('Animation frame paths must be non-empty strings.');
    }

    const clip: AnimationClip = Object.freeze({
      name: validatedName,
      frames: Object.freeze([...framePaths]),
      fps: validateFps(options.fps ?? DEFAULT_FPS),
      loop: options.loop ?? DEFAULT_LOOP,
    });

    this.clips.set(validatedName, clip);
    return clip;
  }

  public registerFromFolder(
    name: string,
    folderPath: string,
    frameModules: AnimationFrameModules,
    options: AnimationRegistrationOptions = {},
  ): AnimationClip {
    return this.register(
      name,
      loadAnimationFramesFromFolder(folderPath, frameModules),
      options,
    );
  }

  public registerFolders(
    rootFolderPath: string,
    frameModules: AnimationFrameModules,
    options: AnimationFolderRegistrationOptions = {},
  ): readonly AnimationClip[] {
    const normalizedRootPath = normalizePath(rootFolderPath);

    if (normalizedRootPath.length === 0) {
      throw new TypeError('An animation root folder path must be provided.');
    }

    const folderNames = new Set<string>();

    for (const modulePath of Object.keys(frameModules)) {
      const normalizedModulePath = normalizePath(modulePath);
      const rootPrefix = `${normalizedRootPath}/`;
      const rootIndex = normalizedModulePath.lastIndexOf(rootPrefix);

      if (rootIndex < 0) {
        continue;
      }

      const relativePath = normalizedModulePath.slice(
        rootIndex + rootPrefix.length,
      );
      const separatorIndex = relativePath.indexOf('/');

      if (separatorIndex > 0) {
        folderNames.add(relativePath.slice(0, separatorIndex));
      }
    }

    return [...folderNames]
      .sort((left, right) => framePathSorter.compare(left, right))
      .map((animationName) => {
        const animationOptions = options.getAnimationOptions?.(animationName);

        return this.registerFromFolder(
          animationName,
          `${normalizedRootPath}/${animationName}`,
          frameModules,
          {
            fps: animationOptions?.fps ?? options.fps ?? DEFAULT_FPS,
            loop: animationOptions?.loop ?? options.loop ?? DEFAULT_LOOP,
          },
        );
      });
  }

  public get(name: string): AnimationClip | undefined {
    return this.clips.get(name);
  }

  public require(name: string): AnimationClip {
    const clip = this.get(name);

    if (clip === undefined) {
      throw new RangeError(`Animation "${name}" is not registered.`);
    }

    return clip;
  }

  public has(name: string): boolean {
    return this.clips.has(name);
  }

  public unregister(name: string): boolean {
    return this.clips.delete(name);
  }
}
