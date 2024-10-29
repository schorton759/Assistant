const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Dropbox } = require('dropbox');
const OpenAI = require("openai");
const pptxgen = require("pptxgenjs");

const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateSlideContent(topic, slides = 5) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{
      role: "system",
      content: "You are a helpful assistant that creates detailed slide content for presentations."
    }, {
      role: "user",
      content: `Create a detailed outline for a presentation on "${topic}". Include ${slides} slides with bullet points for each slide. Format the output in JSON with keys as slide numbers and values as arrays of bullet points.`
    }],
    max_tokens: 1000,
  });

  return JSON.parse(response.data.choices[0].message.content.trim());
}

async function createPdfPresentation(content, tempDir) {
  const markdownContent = Object.entries(content).map(([slideNum, bullets]) => {
    return `# Slide ${slideNum}\n\n${bullets.map(bullet => `- ${bullet}`).join('\n')}`;
  }).join('\n\n---\n\n');

  fs.writeFileSync(path.join(tempDir, 'slides.md'), markdownContent);

  execSync(`npx slidev export --output ${path.join(tempDir, 'presentation.pdf')}`, { cwd: tempDir });

  return path.join(tempDir, 'presentation.pdf');
}

async function createPptxPresentation(content, tempDir) {
  const pres = new pptxgen();

  Object.entries(content).forEach(([slideNum, bullets]) => {
    const slide = pres.addSlide();
    slide.addText(`Slide ${slideNum}`, { x: 0.5, y: 0.5, fontSize: 18, bold: true });
    bullets.forEach((bullet, index) => {
      slide.addText(bullet, { x: 0.5, y: 1 + (index * 0.5), fontSize: 14 });
    });
  });

  const pptxPath = path.join(tempDir, 'presentation.pptx');
  await pres.writeFile({ fileName: pptxPath });

  return pptxPath;
}

async function createPresentation(topic, format = 'pdf', slides = 5) {
  const content = await generateSlideContent(topic, slides);
  
  const tempDir = path.join(__dirname, '../../temp', Date.now().toString());
  fs.mkdirSync(tempDir, { recursive: true });

  if (format === 'pdf') {
    return await createPdfPresentation(content, tempDir);
  } else if (format === 'pptx') {
    return await createPptxPresentation(content, tempDir);
  } else {
    throw new Error('Unsupported format');
  }
}

async function uploadToDropbox(filePath) {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const response = await dbx.filesUpload({
    path: '/' + fileName,
    contents: fileContent
  });

  return response.result.path_display;
}

async function generateAndUploadPresentation(topic, format = 'pdf', slides = 5) {
  const presentationPath = await createPresentation(topic, format, slides);
  const dropboxPath = await uploadToDropbox(presentationPath);
  
  fs.rmSync(path.dirname(presentationPath), { recursive: true, force: true });

  return dropboxPath;
}

module.exports = { generateAndUploadPresentation };
