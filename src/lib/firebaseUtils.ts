import { auth } from "./firebase";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // Log only non-PII data: operation type, path, and sanitized error message.
  // Never log userId, email, or any user-identifiable information to the console.
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };

  // Only log auth status (not identity) in development
  if (import.meta.env.DEV) {
    console.error('Firestore Error:', JSON.stringify(errInfo), '| Authenticated:', !!auth.currentUser);
  } else {
    console.error('Firestore Error:', errInfo.operationType, errInfo.path);
  }
}
