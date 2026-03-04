import React from 'react';
import TagInput from './TagInput';

interface IdentitySettingsProps {
  humanDescription: string;
  tags: string[];
  onDescriptionChange: (desc: string) => void;
  onTagsChange: (tags: string[]) => void;
}

export default function IdentitySettings({
  humanDescription,
  tags,
  onDescriptionChange,
  onTagsChange,
}: IdentitySettingsProps) {
  return (
    <div className="settings-section">
      <div className="form-group">
        <label>About my human</label>
        <textarea
          value={humanDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe yourself — this is what your agent uses to represent you to other agents"
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
    </div>
  );
}
