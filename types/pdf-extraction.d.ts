declare module "pdf-extraction" {
  interface PdfData {
    text: string;
  }

  function extract(buffer: Buffer): Promise<PdfData>;

  export default extract;
}