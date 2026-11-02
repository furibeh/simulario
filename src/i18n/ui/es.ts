/** Interface strings. Spanish is the source of truth; en.ts must have the same keys. */
export const es = {
  "site.name": "Simulario",
  "site.tagline":
    "Rutas interactivas de ingeniería de sistemas: predice, ejecuta y entiende por qué.",
  "nav.label": "Principal",
  "nav.paths": "Rutas",
  "nav.about": "Acerca",
  "lang.label": "Idioma",
  "lang.es": "Español",
  "lang.en": "English",
  "theme.toLight": "Cambiar a tema claro",
  "theme.toDark": "Cambiar a tema oscuro",
  "theme.toSystem": "Usar el tema del sistema",
  "redirect.choose": "Elige tu idioma",
  "player.region": "Reproductor de la simulación",
  "player.run": "Ejecutar",
  "player.pause": "Pausar",
  "player.resume": "Continuar",
  "player.replay": "Repetir",
  "player.stepBack": "Turno anterior",
  "player.stepForward": "Siguiente turno",
  "player.toStart": "Ir al inicio",
  "player.toEnd": "Ir al final",
  "player.speed": "Velocidad",
  "player.slow": "Lenta",
  "player.normal": "Normal",
  "player.fast": "Rápida",
} as const;

export type UiKey = keyof typeof es;
export type UiDict = Record<UiKey, string>;
