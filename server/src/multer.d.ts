declare module 'multer' {
  import { RequestHandler } from 'express';

  interface DiskStorageOptions {
    destination: (req: any, file: any, cb: (error: Error | null, destination: string) => void) => void;
    filename: (req: any, file: any, cb: (error: Error | null, filename: string) => void) => void;
  }

  interface Options {
    dest?: string;
    storage?: any;
    fileFilter?: (req: any, file: any, cb: (error: Error | null, accept: boolean) => void) => void;
    limits?: { fileSize?: number };
  }

  interface MulterInstance {
    single(field: string): RequestHandler;
  }

  interface MulterStatic {
    (options?: Options): MulterInstance;
    diskStorage(options: DiskStorageOptions): any;
    memoryStorage(): any;
  }

  const multer: MulterStatic;
  export default multer;
}