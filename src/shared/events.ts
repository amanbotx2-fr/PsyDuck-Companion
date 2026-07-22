export const IPC_CHANNELS = {
  cursorPosition: 'psyduck:cursor-position',
  getCursorPosition: 'psyduck:get-cursor-position',
  moveWindow: 'psyduck:move-window',
  showCompanionContextMenu: 'psyduck:show-context-menu',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  settingsChanged: 'settings:changed',
} as const;
