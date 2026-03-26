export interface Request extends express.Request {
  user?: any;
}

// Декларации типов для Node.js
declare module 'http' {
  interface AddressInfo {
    port: number;
    family: string;
    address: string;
  }
}

// Декларации модулей
declare module './middleware/error' {
  export function errorMiddleware(): express.ErrorRequestHandler;
}