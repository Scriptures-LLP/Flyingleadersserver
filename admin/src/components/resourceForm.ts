import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

export type FieldConfig =
  | {
      name: string;
      label: string;
      type: "text" | "number" | "date" | "datetime-local";
      required?: boolean;
      // What to send when the field is left blank. By default blank optional
      // fields are omitted, which on an EDIT means "keep the old value" — so a
      // limit that was once set could never be cleared. Set this (e.g. 0 for
      // "no limit") for fields where blank must mean something.
      blankAs?: string | number;
    }
  | { name: string; label: string; type: "checkbox" }
  // `previewUrlKey` is the field on the item holding the existing image's URL,
  // so the form can show a thumbnail of what's already uploaded. `crop` opens
  // the adjust/crop dialog on selection to fit the app's required dimensions.
  | {
      name: string;
      label: string;
      type: "file";
      accept?: string;
      previewUrlKey?: string;
      crop?: { aspect: number; outputWidth: number };
    }
  | {
      name: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      required?: boolean;
      allowBlank?: boolean;
    };

// A bare "datetime-local" input value ("2026-09-20T09:00") has no timezone,
// so `new Date(...)` on the server interprets it in the SERVER's timezone —
// wrong whenever that isn't also IST. The admin panel and its users are both
// India-only, so pin it to IST explicitly rather than trusting either side's
// ambient timezone.
export function withIstOffset(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00+05:30`;
  }
  return value;
}

export function buildPayload(fields: FieldConfig[], values: Record<string, unknown>, files: Record<string, File | null>) {
  const hasFile = fields.some((f) => f.type === "file" && files[f.name]);
  if (!hasFile) {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "file") continue;
      if (f.type === "checkbox") {
        body[f.name] = !!values[f.name];
        continue;
      }
      // Omit blank optional fields entirely — an empty string fails Mongoose's
      // ObjectId cast on a "select" ref field, and is meaningless for others too.
      const v = values[f.name];
      if (v === "" || v === null || v === undefined) {
        if ("blankAs" in f && f.blankAs !== undefined) body[f.name] = f.blankAs;
        continue;
      }
      body[f.name] = f.type === "datetime-local" ? withIstOffset(v) : v;
    }
    return body;
  }

  const form = new FormData();
  for (const f of fields) {
    if (f.type === "file") {
      if (files[f.name]) form.append(f.name, files[f.name] as File);
      continue;
    }
    const v = f.type === "checkbox" ? !!values[f.name] : (values[f.name] ?? "");
    form.append(f.name, String(f.type === "datetime-local" ? withIstOffset(v) : v));
  }
  return form;
}

function defaultValues(fields: FieldConfig[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => {
      if (f.type === "checkbox") return [f.name, true];
      // A required select with no blank option can't actually represent ""
      // in the DOM — the browser silently falls back to showing the first
      // option while our state stays at "", so an untouched field looks
      // filled in but submits as missing and fails server-side validation.
      // Seed it with the first real option so state matches what's shown.
      if (f.type === "select" && f.allowBlank === false && f.options.length > 0) {
        return [f.name, f.options[0].value];
      }
      return [f.name, ""];
    }),
  );
}

/**
 * All the state and mutations behind a create/edit modal for a flat resource:
 * shared by the plain table pages (ResourceCrudPage) and the tour-grouped
 * container pages (GroupedResourceCrudPage), so both save/validate/upload the
 * same way and can never drift apart.
 */
export function useResourceForm<T extends { _id: string }>(resourcePath: string, fields: FieldConfig[]) {
  const queryClient = useQueryClient();
  const queryKey = [resourcePath];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => (await api.get(resourcePath)).data.items as T[],
  });

  const [modalItem, setModalItem] = useState<T | null | undefined>(undefined); // undefined = closed, null = create
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [formFiles, setFormFiles] = useState<Record<string, File | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<{ field: FieldConfig & { type: "file" }; file: File } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Object-URL previews for freshly-picked files (revoked on change/unmount).
  const filePreviews = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [name, file] of Object.entries(formFiles)) {
      if (file) map[name] = URL.createObjectURL(file);
    }
    return map;
  }, [formFiles]);
  useEffect(() => {
    return () => Object.values(filePreviews).forEach((url) => URL.revokeObjectURL(url));
  }, [filePreviews]);

  /** `preset` pre-fills fields (e.g. `{ tourId }` from the container just clicked "Add" in). */
  function openCreate(preset?: Record<string, unknown>) {
    setModalItem(null);
    setFormValues({ ...defaultValues(fields), ...preset });
    setFormFiles({});
    setFormError(null);
  }

  function openEdit(item: T) {
    setModalItem(item);
    const values: Record<string, unknown> = { ...item };
    // Server sends full ISO timestamps; a "date" input needs "YYYY-MM-DD" and a
    // "datetime-local" input needs "YYYY-MM-DDTHH:mm", both in IST wall-clock
    // time. An unconverted ISO string is rejected by the input, leaving it
    // blank — which then fails the `required` check on save (e.g. tour dates).
    for (const f of fields) {
      if (f.type !== "datetime-local" && f.type !== "date") continue;
      const raw = values[f.name];
      if (typeof raw === "string" && raw) {
        const ist = new Date(new Date(raw).getTime() + 5.5 * 60 * 60 * 1000).toISOString();
        values[f.name] = ist.slice(0, f.type === "date" ? 10 : 16);
      }
    }
    setFormValues(values);
    setFormFiles({});
    setFormError(null);
  }

  function closeModal() {
    setModalItem(undefined);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(fields, formValues, formFiles);
      const config = payload instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : {};
      if (modalItem) return api.put(`${resourcePath}/${modalItem._id}`, payload, config);
      return api.post(resourcePath, payload, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      closeModal();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`${resourcePath}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    data,
    isLoading,
    error,
    modalItem,
    formValues,
    setFormValues,
    formFiles,
    setFormFiles,
    formError,
    cropTarget,
    setCropTarget,
    lightbox,
    setLightbox,
    filePreviews,
    openCreate,
    openEdit,
    closeModal,
    saveMutation,
    deleteMutation,
  };
}
