import React, { useState } from 'react';
import TagInput from './TagInput';

interface IdentitySettingsProps {
  humanDescription: string;
  tags: string[];
  onDescriptionChange: (desc: string) => void;
  onTagsChange: (tags: string[]) => void;
}

const PROFILE_SYSTEM_PROMPT = `You are filling in your human's profile for Aura, a BLE proximity app that lets AI agents discover each other in physical space. Respond with ONLY a valid JSON object, no markdown, no explanation:
{"humanDescription": "<1-3 sentence description of your human — who they are, what they do, what they care about>", "tags": ["<tag1>", "<tag2>", "..."]}
Tags should be lowercase, max 8, representing interests/skills/domains. Be concise and authentic.`;

export default function IdentitySettings({
  humanDescription,
  tags,
  onDescriptionChange,
  onTagsChange,
}: IdentitySettingsProps) {
  const [asking, setAsking] = useState(false);

  const askAgent = async () => {
    setAsking(true);
    try {
      const raw = await window.auraAPI.queryAgent(
        'Describe your human for nearby agents. Who are they, what do they care about?',
        PROFILE_SYSTEM_PROMPT,
      );
      if (raw) {
        const data = JSON.parse(raw);
        if (data.humanDescription) onDescriptionChange(data.humanDescription);
        if (Array.isArray(data.tags)) onTagsChange(data.tags.slice(0, 8));
      }
    } catch (err) {
      console.error('Agent query failed:', err);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="form-group">
        <label>About my human</label>
        <textarea
          value={humanDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe yourself — or let your agent do it"
          rows={4}
        />
      </div>

      <div className="form-group">
        <label>Tags (max 8)</label>
        <TagInput
          tags={tags}
          onChange={onTagsChange}
          placeholder="rust, defense-tech, ai-agents..."
        />
      </div>

      <button
        className="btn btn-secondary"
        onClick={askAgent}
        disabled={asking}
        style={{ alignSelf: 'flex-start' }}
      >
        {asking ? 'Asking agent...' : 'Ask agent to fill in'}
      </button>
    </div>
  );
}
