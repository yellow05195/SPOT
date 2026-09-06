import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Couche 4, étage 2 (spec 4.4) — escalade vers un modèle de vision par API, UNIQUEMENT sur la bande
 * médiane (≈10 % des cas). Une phrase, une réponse JSON stricte. Le taux d'escalade est une métrique
 * de production : au-dessus de 20 %, les embeddings de référence sont mauvais, pas le budget.
 */

export const EscalationAnswer = z.object({
  present: z.boolean(),
  confiance: z.number().min(0).max(1),
  motif: z.string(),
});
export type EscalationAnswer = z.infer<typeof EscalationAnswer>;

export interface Escalator {
  ask(image: Buffer, mediaType: "image/webp" | "image/jpeg" | "image/png", brandName: string, objectHint: string): Promise<EscalationAnswer | null>;
}

export const ESCALATION_ACCEPT_CONFIDENCE = 0.7;

export class ClaudeEscalator implements Escalator {
  private readonly client: Anthropic;
  constructor(
    private readonly model: string,
    apiKey?: string,
  ) {
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async ask(image: Buffer, mediaType: "image/webp" | "image/jpeg" | "image/png", brandName: string, objectHint: string) {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 1024,
        output_config: { effort: "low", format: zodOutputFormat(EscalationAnswer) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
              {
                type: "text",
                text: `Cette photo montre-t-elle un ${objectHint} de la marque ${brandName}, physique et grandeur nature, photographié directement dans une scène réelle ? Réponds present=false, avec le motif, si le logo apparaît sur un écran (téléphone, ordinateur, télévision, borne), sur une impression, une affiche, un emballage de papier photo ou une image d'image, dans un reflet ou un miroir, sur un jouet, une miniature ou une maquette, ou si l'image semble générée ou retouchée. Réponds par un JSON strict : {present: bool, confiance: 0-1, motif: string}.`,
              },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") return null;
      return response.parsed_output ?? null;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return null;
      if (error instanceof Anthropic.APIError) return null;
      throw error;
    }
  }
}

/** Sans clé API (tests, dev hors ligne) : l'escalade est indisponible, la bande médiane est refusée. */
export class NullEscalator implements Escalator {
  async ask(): Promise<null> {
    return null;
  }
}
