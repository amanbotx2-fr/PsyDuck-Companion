export const IPC_CHANNELS = {
  cursorPosition: 'psyduck:cursor-position',
  getCursorPosition: 'psyduck:get-cursor-position',
  moveWindow: 'psyduck:move-window',
  showCompanionContextMenu: 'psyduck:show-context-menu',
  getRuntimeSettings: 'runtime-settings:get',
  runtimeSettingsChanged: 'runtime-settings:changed',
  getPreferencesSettings: 'preferences-settings:get',
  updatePreferencesSettings: 'preferences-settings:update',
  updateAiConfiguration: 'preferences-ai:configure',
  askAI: 'ai:ask',
  listAIModels: 'ai:list-models',
  testAIConnection: 'ai:test-connection',
} as const;
