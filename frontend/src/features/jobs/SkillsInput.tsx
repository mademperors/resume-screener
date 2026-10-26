import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface SkillsInputProps {
  id: string
  value: string[]
  onChange: (skills: string[]) => void
  placeholder: string
  addLabel: string
  invalid?: boolean
  describedBy?: string
}

export function SkillsInput({
  id,
  value,
  onChange,
  placeholder,
  addLabel,
  invalid,
  describedBy,
}: SkillsInputProps) {
  const [draft, setDraft] = useState('')

  const addSkill = () => {
    const skill = draft.trim()
    if (!skill) return

    const duplicate = value.some((existing) => existing.toLowerCase() === skill.toLowerCase())
    setDraft('')
    if (duplicate) return

    onChange([...value, skill])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addSkill()
      return
    }

    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        <Button type="button" variant="outline" onClick={addSkill} aria-label={addLabel}>
          Add
        </Button>
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Added skills">
          {value.map((skill) => (
            <li key={skill}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {skill}
                <button
                  type="button"
                  className="rounded-sm p-0.5 transition-colors hover:bg-muted-foreground/20"
                  onClick={() => onChange(value.filter((item) => item !== skill))}
                  aria-label={`Remove ${skill}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
