// What to ask next (L13), drawn from the layer payload only. A prompted question carries the report fact that triggered it with its
// evidence chip and provenance; a standard question says so. Nothing is worked out here.
import { Chip } from "../../server/contracts/layer";
import { QUESTIONS } from "../../site/copy";
import { ChipBadge, provenanceText } from "./FigureTile";

interface Trigger { text: string; chip: Chip; source_ids: string[]; as_of: string | null }
interface Item { id: string; question: string; why: string; ask: string; standard: boolean; trigger: Trigger | null }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function asTrigger(v: unknown): Trigger | null {
  if (!isObj(v) || typeof v.text !== "string" || !Chip.safeParse(v.chip).success) return null;
  const ids = Array.isArray(v.source_ids) ? v.source_ids.filter((x): x is string => typeof x === "string") : [];
  return { text: v.text, chip: v.chip as Chip, source_ids: ids, as_of: typeof v.as_of === "string" ? v.as_of : null };
}

function asItems(v: unknown): Item[] {
  if (!Array.isArray(v)) return [];
  const out: Item[] = [];
  for (const q of v) {
    if (!isObj(q) || typeof q.id !== "string" || typeof q.question !== "string") continue;
    const trigger = asTrigger(q.trigger);
    // A question is either prompted by a fact or standard. One that claims neither is not drawn.
    const standard = q.standard === true;
    if (!standard && !trigger) continue;
    out.push({ id: q.id, question: q.question, why: typeof q.why === "string" ? q.why : "", ask: typeof q.ask === "string" ? q.ask : "", standard, trigger: standard ? null : trigger });
  }
  return out;
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <div className="qgroup">
      <h3>{title}</h3>
      <ol className="qlist">
        {items.map((q) => (
          <li key={q.id} data-question={q.id} data-standard={q.standard ? "true" : "false"}>
            <p className="q">{q.question}</p>
            {q.why && <p className="qwhy">{q.why}</p>}
            <p className="qmeta">
              {q.ask && <span>{QUESTIONS.askLabel} {q.ask}</span>}
              {q.standard ? (
                <span className="chip unk"><i />{QUESTIONS.standardTag}</span>
              ) : (
                q.trigger && (
                  <span className="qfact">
                    {QUESTIONS.promptedBy}: {q.trigger.text} <ChipBadge chip={q.trigger.chip} />
                    {q.trigger.source_ids.length > 0 && <span className="prov"> {provenanceText(q.trigger.source_ids, q.trigger.as_of)}</span>}
                  </span>
                )
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function QuestionsList({ payload }: { payload: Record<string, unknown> }) {
  const items = asItems(payload.questions);
  if (items.length === 0) return null;
  return (
    <div className="qs">
      <p className="tabnote">{QUESTIONS.intro}</p>
      <Group title={QUESTIONS.promptedGroup} items={items.filter((q) => !q.standard)} />
      <Group title={QUESTIONS.standardGroup} items={items.filter((q) => q.standard)} />
    </div>
  );
}
