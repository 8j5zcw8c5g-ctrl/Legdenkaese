/* =====================================================================
   Leg den Käse – Einstellungen
   Das ist die EINZIGE Datei, die du anpassen musst (siehe ANLEITUNG.md).
   ===================================================================== */
window.LDK_CONFIG = {
  /* Adresse deines Cloudflare Workers (Schritt 2 der Anleitung) */
  aiServerUrl: 'https://legdenkaese-ki.DEIN-KONTO.workers.dev',

  /* Deine GitHub-Pages-Adressen (Schritt 1): DEIN-GITHUB-NAME ersetzen */
  privacyUrl: 'https://DEIN-GITHUB-NAME.github.io/legdenkaese/datenschutz.html',
  supportUrl: 'https://DEIN-GITHUB-NAME.github.io/legdenkaese/support.html',

  /* Für Datenschutzerklärung und Support-Seite (Pflicht für den App Store) */
  ownerName: 'DEIN NAME',
  contactEmail: 'DEINE-EMAIL@BEISPIEL.CH',
  ownerAddress: '',   /* freiwillig, z. B. 'Musterstrasse 1, 8000 Zürich, Schweiz' */

  /* Muss zum DAILY_LIMIT im Worker passen */
  dailyLimit: 100
};
