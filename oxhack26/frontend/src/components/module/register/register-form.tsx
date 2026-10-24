"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input, Textarea } from "~/components/ui/input";
import { AccordionSection } from "./accordion-section";
import { Field } from "./field";

type Values = {
  name: string;
  email: string;
  organisation: string;
  message: string;
  website: string;
};
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = {
  name: "",
  email: "",
  organisation: "",
  message: "",
  website: "",
};

// Per-step validation. Swap for zod + react-hook-form once the form grows.
const validators: Record<"about" | "details", (v: Values) => Errors> = {
  about: (v) => ({
    ...(!v.name.trim() && { name: "Name is required" }),
    ...(!/^\S+@\S+\.\S+$/.test(v.email) && {
      email: "Enter a valid email address",
    }),
    ...(!v.organisation.trim() && {
      organisation: "Organisation is required",
    }),
  }),
  details: (v) => ({
    ...(v.website &&
      !/^https?:\/\//.test(v.website) && {
        website: "Must start with http(s)://",
      }),
  }),
};

/**
 * Two-step accordion form: step 2 stays LOCKED until step 1 validates.
 * On submit, POST `values` to your backend and route to /status.
 */
export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [open, setOpen] = useState<"about" | "details">("about");
  const [aboutDone, setAboutDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set =
    (key: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const bind = (key: keyof Values) => ({
    id: key,
    value: values[key],
    onChange: set(key),
    "aria-invalid": !!errors[key],
  });

  const next = () => {
    const found = validators.about(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setAboutDone(true);
    setOpen("details");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validators.details(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      // await fetch("/api/register", { method: "POST", body: JSON.stringify(values) });
      await new Promise((r) => setTimeout(r, 600));
      toast.success("Registration submitted");
      router.push("/status");
    } catch {
      toast.error("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="w-full divide-y border-y">
      <AccordionSection
        id="about"
        title="About you"
        questionsCount={3}
        expanded={open === "about"}
        onToggle={() => setOpen("about")}
      >
        <div className="grid max-w-2xl gap-6">
          <Field id="name" label="Full name" error={errors.name}>
            <Input autoComplete="name" {...bind("name")} />
          </Field>
          <Field id="email" label="Email" error={errors.email}>
            <Input type="email" autoComplete="email" {...bind("email")} />
          </Field>
          <Field
            id="organisation"
            label="Organisation"
            error={errors.organisation}
          >
            <Input {...bind("organisation")} />
          </Field>
          <Button type="button" onClick={next} className="w-fit" size="lg">
            Continue
          </Button>
        </div>
      </AccordionSection>

      <AccordionSection
        id="details"
        title="Details"
        questionsCount={2}
        expanded={open === "details"}
        disabled={!aboutDone}
        onToggle={() => setOpen("details")}
      >
        <div className="grid max-w-2xl gap-6">
          <Field
            id="message"
            label="Anything we should know? (optional)"
            hint="Dietary needs, access requirements, questions."
            error={errors.message}
          >
            <Textarea {...bind("message")} />
          </Field>
          <Field
            id="website"
            label="Website or LinkedIn (optional)"
            error={errors.website}
          >
            <Input type="url" placeholder="https://" {...bind("website")} />
          </Field>
          <Button
            type="submit"
            loading={submitting}
            className="w-fit"
            size="lg"
          >
            Submit registration
          </Button>
        </div>
      </AccordionSection>
    </form>
  );
}
