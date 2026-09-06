/** The claim server speaks French; the site speaks English. Rejection reasons, in plain words. */
const MOTIFS: Record<string, string> = {
  "quota atteint": "daily limit reached",
  "métadonnées de fichier détectées": "file metadata detected",
  "capteurs immobiles": "the phone did not move at all",
  "capteurs trop réguliers": "motion looks synthetic",
  "images identiques": "both frames are identical",
  "horloge incohérente": "clock mismatch",
  "la scène semble plane": "the scene looks flat",
  "motif d'écran détecté": "screen pattern detected",
  "cadre d'écran détecté": "screen frame detected",
  "objet non reconnu": "object not recognised",
  "déjà consignée": "already logged",
  "déjà consignée par quelqu'un d'autre": "already logged by someone else",
  "marque retirée": "brand withdrawn",
  "contre-angle trop proche": "second angle too close to the first",
  "contre-angle hors délai": "second angle came too late",
  "prise introuvable": "sighting not found",
  "prise incomplète": "incomplete sighting",
  "le serveur n'a pas répondu": "the server did not answer",
};

export function motifEn(fr: string): string {
  return MOTIFS[fr] ?? fr;
}
