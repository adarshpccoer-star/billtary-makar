import { PDFDocument } from "pdf-lib";
export async function fillPdfForm() {
  
  const filePath = "./public/temp23.pdf"; 
  
  const file = Bun.file(filePath);
  const formPdfBytes = await file.arrayBuffer();

  const pdfDoc = await PDFDocument.load(formPdfBytes);

  const form = pdfDoc.getForm();

  const fields = form.getFields();
  fields.forEach(field => console.log('Field Name:', field.getName()));


}