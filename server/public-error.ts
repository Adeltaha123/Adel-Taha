/** Only these deliberately authored messages may be returned for upstream failures. */
export class PublicError extends Error { constructor(public statusCode:number,message:string) { super(message); } }
