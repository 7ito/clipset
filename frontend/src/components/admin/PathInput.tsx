import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"

interface PathInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  helperText?: string
  error?: string
  placeholder?: string
}

export function PathInput({ label, value, onChange, helperText, error, placeholder }: PathInputProps) {
  return (
    <Field invalid={!!error}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "/path/to/storage"}
      />
      {helperText && !error && <FieldDescription>{helperText}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
