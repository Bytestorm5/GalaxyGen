import { useMemo, useState } from "react";
import type { SaveSlot } from "../lib/types";

type Props = {
  saves: SaveSlot[];
  onStart: (slot: SaveSlot) => void;
  onGenerate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function SaveMenu({ saves, onStart, onGenerate, onRename, onDuplicate, onDelete }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const sorted = useMemo(() => [...saves].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [saves]);

  return (
    <div className="menu-shell">
      <div className="panel">
        <h2>Continue</h2>
        <p>Pick a save slot to drop straight into the galaxy, or start fresh with a new generation.</p>
        <div className="list">
          {sorted.map((slot) => (
            <div className="card" key={slot.id}>
              <div>
                {editing === slot.id ? (
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      if (draft.trim()) onRename(slot.id, draft.trim());
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draft.trim()) {
                        onRename(slot.id, draft.trim());
                        setEditing(null);
                      }
                    }}
                    autoFocus
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(158, 252, 255, 0.25)",
                      color: "var(--text)",
                      padding: "6px 8px",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <h3 style={{ margin: 0 }}>{slot.name}</h3>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                  <span className="badge">Tick {slot.tick}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{slot.updatedAt}</span>
                </div>
              </div>
              <div className="actions">
                <button onClick={() => onStart(slot)}>Start</button>
                <button
                  onClick={() => {
                    setEditing(slot.id);
                    setDraft(slot.name);
                  }}
                >
                  Rename
                </button>
                <button onClick={() => onDuplicate(slot.id)}>Copy</button>
                <button onClick={() => onDelete(slot.id)} style={{ borderColor: "rgba(255,99,99,0.5)" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={onGenerate}>Generate new galaxy</button>
        </div>
      </div>

      <div className="panel">
        <h2>What&apos;s next</h2>
        <p>
          Saves now support rename, copy, and delete operations. Starting a save will open the ingame view with panning, zoom,
          and sidebars ready for 4X systems.
        </p>
      </div>
    </div>
  );
}
