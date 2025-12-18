import * as React from "react"
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRegister } from "@/api/auth"
import { useValidateInvitation } from "@/api/invitations"
import { registerSchema, type RegisterFormData } from "@/lib/validations/auth"
import { getToken } from "@/lib/auth"
import { toast } from "@/lib/toast"
import { getErrorMessage } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loading } from "@/components/common/Loading"

export const Route = createFileRoute("/register/$token")({
  beforeLoad: () => {
    const hasToken = getToken()
    if (hasToken) {
      throw redirect({ to: "/dashboard" })
    }
  },
  component: RegisterPage
})

function RegisterPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const register = useRegister()
  const { data: validation, isLoading, error } = useValidateInvitation(token)
  
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
    setValue
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      invitation_token: token
    }
  })

  React.useEffect(() => {
    if (validation?.valid && validation.email) {
      setValue("email", validation.email)
    }
  }, [validation, setValue])

  const onSubmit = (data: RegisterFormData) => {
    register.mutate(data, {
      onSuccess: () => {
        toast.success("Registration successful! Please log in.")
        navigate({ to: "/login" })
      },
      onError: (error) => {
        toast.error(getErrorMessage(error))
      }
    })
  }

  if (isLoading) {
    return <Loading />
  }

  if (error || !validation?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              {validation?.message || "This invitation link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription>Fill in your details to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                disabled
                {...registerField("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                type="text"
                placeholder="johndoe"
                autoComplete="username"
                {...registerField("username")}
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Letters, numbers, and underscores only
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...registerField("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                At least 8 characters
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...registerField("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </Field>

            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
