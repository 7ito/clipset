import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"

interface FileSizeInputProps {
  label: string
  value: number // bytes
  onChange: (bytes: number) => void
  helperText?: string
  error?: string
}

type Unit = "MB" | "GB"

const BYTES_PER_MB = 1048576 // 1024 * 1024
const BYTES_PER_GB = 1073741824 // 1024 * 1024 * 1024

export function FileSizeInput({ label, value, onChange, helperText, error }: FileSizeInputProps) {
  // Determine initial unit based on value size
  const getInitialUnit = (bytes: number): Unit => {
    return bytes >= BYTES_PER_GB ? "GB" : "MB"
  }

  const [unit, setUnit] = useState<Unit>(getInitialUnit(value))
  const [displayValue, setDisplayValue] = useState("")

  // Convert bytes to display value when value prop changes
  useEffect(() => {
    if (unit === "GB") {
      setDisplayValue((value / BYTES_PER_GB).toFixed(2))
    } else {
      setDisplayValue((value / BYTES_PER_MB).toFixed(2))
    }
  }, [value, unit])

  const handleValueChange = (newValue: string) => {
    setDisplayValue(newValue)
    
    // Convert to bytes and call onChange
    const numValue = parseFloat(newValue)
    if (!isNaN(numValue) && numValue >= 0) {
      const bytes = unit === "GB" 
        ? Math.round(numValue * BYTES_PER_GB)
        : Math.round(numValue * BYTES_PER_MB)
      onChange(bytes)
    }
  }

  const handleUnitChange = (newUnit: Unit) => {
    setUnit(newUnit)
    
    // Convert current display value to new unit
    const currentBytes = unit === "GB"
      ? parseFloat(displayValue) * BYTES_PER_GB
      : parseFloat(displayValue) * BYTES_PER_MB
    
    if (!isNaN(currentBytes)) {
      const newDisplayValue = newUnit === "GB"
        ? (currentBytes / BYTES_PER_GB).toFixed(2)
        : (currentBytes / BYTES_PER_MB).toFixed(2)
      setDisplayValue(newDisplayValue)
    }
  }

  return (
    <Field invalid={!!error}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          type="number"
          value={displayValue}
          onChange={(e) => handleValueChange(e.target.value)}
          step={unit === "GB" ? "0.01" : "1"}
          min="0"
          className="flex-1"
        />
        <Select value={unit} onValueChange={handleUnitChange}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MB">MB</SelectItem>
            <SelectItem value="GB">GB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {helperText && !error && <FieldDescription>{helperText}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
