/** Only these deliberately authored messages may be returned for upstream failures. The optional code lets clients show their own wording. */
export class PublicError extends Error { constructor(public statusCode:number,message:string,public code?:string) { super(message); } }
