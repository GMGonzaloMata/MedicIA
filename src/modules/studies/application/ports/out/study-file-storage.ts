export interface StoredObjectInfo {
  key: string;
  lastModified: Date;
}

// Almacenamiento privado de los archivos de estudios. La clave la arma siempre el servidor; el cliente
// nunca la envía ni la recibe.
export interface StudyFileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;

  // Borrar un objeto que no existe no es un error.
  delete(key: string): Promise<void>;

  list(prefix: string): Promise<StoredObjectInfo[]>;
}
