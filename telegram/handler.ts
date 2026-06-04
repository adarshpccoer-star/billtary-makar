import dotenv from "dotenv";
dotenv.config();
import { Markup, type Telegraf } from "telegraf";
import fs from "fs";
import axios from "axios";
import { PDFDocument } from "pdf-lib";
import { message } from "telegraf/filters";
import fontkit from "@pdf-lib/fontkit"; // Required for custom fonts

export function registerHandlers(bot: Telegraf) {
  const waitingForTemplate = new Set<string>();
  const activeForms = new Map<
    string,
    {
      fileId: string;
      fields: string[];
      currentIndex: number;
      answers: Record<string, string>;
    }
  >();

  bot.command("template", async (ctx) => {
    waitingForTemplate.add(String(ctx.from.id));
    await ctx.reply("Please upload your PDF template.");
  });

  bot.on(message("document"), async (ctx) => {
    const userId = String(ctx.from.id);
    if (!waitingForTemplate.has(userId)) {
      return;
    }

    const fileId = ctx.message.document.file_id;
    let store: Record<string, any> = {};

    if (fs.existsSync("store_temp.json")) {
      store = JSON.parse(fs.readFileSync("store_temp.json", "utf8"));
    }

    store[String(userId)] = {
      fileId,
      username: ctx.from.username,
    };

    fs.writeFileSync("store_temp.json", JSON.stringify(store, null, 2));
    waitingForTemplate.delete(userId);

    await ctx.reply("Template saved successfully.");
  });

  bot.command("createNew", async (ctx) => {
    const userId = String(ctx.from.id);

    try {
      if (!fs.existsSync("store_temp.json")) {
        return ctx.reply("No template storage found.");
      }

      const store = JSON.parse(fs.readFileSync("store_temp.json", "utf8"));
      const userData = store[userId];

      if (!userData) {
        return ctx.reply("No template found. Run /template first.");
      }

      const fileInfo = await ctx.telegram.getFile(userData.fileId);

      if (!fileInfo.file_path) {
        return ctx.reply("Unable to access template.");
      }

      const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
      });

      const pdfDoc = await PDFDocument.load(response.data);
      const form = pdfDoc.getForm();

      const fields = form.getFields().map((field) => field.getName());

      if (fields.length === 0) {
        return ctx.reply("No AcroForm fields found in PDF.");
      }

      activeForms.set(userId, {
        fileId: userData.fileId,
        fields,
        currentIndex: 0,
        answers: {},
      });

      await ctx.reply(`Enter ${fields[0]}`);
    } catch (error) {
      console.error(error);
      await ctx.reply("Failed to start form.");
    }
  });

  bot.on(message("text"), async (ctx) => {
    const userId = String(ctx.from.id);
    const formState = activeForms.get(userId);

    if (!formState) {
      return;
    }

    if (ctx.message.text.startsWith("/")) {
      return;
    }

    const currentField = formState.fields[formState.currentIndex];
    formState.answers[currentField as string] = ctx.message.text;
    formState.currentIndex++;

    if (formState.currentIndex < formState.fields.length) {
      const nextField = formState.fields[formState.currentIndex];
      return ctx.reply(`Enter ${nextField}`);
    }

    await ctx.reply("Generating your 3 PDF copies...");

    try {
      const fileInfo = await ctx.telegram.getFile(formState.fileId);
      const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
      });

      const copies = ["Consignor Copy", "Transport Copy", "Driver Copy"];

      // Read Font files from your local system/project repository
      // Ensure you have Consolas-Bold.ttf and Cambria-Bold.ttf in your directory
  // 1. Get Consolas Bold straight from your Windows system fonts folder
const consolasBoldPath = "C:\\Windows\\Fonts\\consolab.ttf"; 

// 2. Keep your custom Cambria Bold path on your desktop folder
const cambriaBoldPath = "C:\\Users\\Adharsh\\OneDrive\\Desktop\\tele-bil\\telegram\\Cambria-Bold.ttf";
      const consolasBoldBuffer = fs.readFileSync(consolasBoldPath);
      const cambriaBoldBuffer = fs.readFileSync(cambriaBoldPath);
      for (const copyType of copies) {
        const pdfDoc = await PDFDocument.load(response.data);
        
        // Register the fontkit module to embed custom TrueType fonts
        pdfDoc.registerFontkit(fontkit);

        // Embed the Bold variants into the current document instance
        const embeddedConsolasBold = await pdfDoc.embedFont(consolasBoldBuffer);
        const embeddedCambriaBold = await pdfDoc.embedFont(cambriaBoldBuffer);

        const form = pdfDoc.getForm();

        // 1. Fill out user fields with Consolas Bold
        Object.entries(formState.answers).forEach(([fieldName, value]) => {
          try {
            const textField = form.getTextField(fieldName);
            textField.setText(value);
            
            // Apply Consolas Bold to regular form text fields
            textField.updateAppearances(embeddedConsolasBold);
          } catch {
            // Field might not exist or isn't a text field, safely skip
          }
        });

        // 2. Fill the "CopyName" field with Cambria Bold
        try {
          const copyNameField = form.getTextField("CopyName");
          copyNameField.setText(copyType);
          
          // Apply Cambria Bold to the specific copy title field
          copyNameField.updateAppearances(embeddedCambriaBold);
        } catch (err) {
          console.warn(`Could not find or set 'CopyName' field for ${copyType}`);
        }

        // Flatten the form to permanently lock the text styling into the layouts
        form.flatten();

        const pdfBytes = await pdfDoc.save();
        const lrNo = formState.answers["LR No"] || "document";
        const sanitizedCopyName = copyType.replace(/\s+/g, "_");

        await ctx.replyWithDocument({
          source: Buffer.from(pdfBytes),
          filename: `filled_${lrNo}_${sanitizedCopyName}.pdf`,
        });
      }

      activeForms.delete(userId);
    } catch (error) {
      console.error(error);
      await ctx.reply("Failed to generate PDFs.");
    }
  });
}