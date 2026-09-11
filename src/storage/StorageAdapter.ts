export type StoredFile = {
  /** Path stored in the DB, relative to the storage root, e.g. "tours/cover-169....jpg" */
  key: string;
  /** Fully-qualified URL the frontend can load the file from. */
  url: string;
};

export interface StorageAdapter {
  /** Persist a file already written to a local tmp path (by multer) under the given folder, return its stored key + public URL. */
  save(folder: string, tmpFilePath: string, originalFilename: string): Promise<StoredFile>;
  /** Remove a previously-stored file by its key. Safe to call on a missing file. */
  remove(key: string): Promise<void>;
  /** Build the public URL for a previously-stored key (e.g. when re-reading a DB row). */
  urlFor(key: string): string;
}
