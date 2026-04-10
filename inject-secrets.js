const fs = require('fs');

const scriptPath = 'script.js';
let content = fs.readFileSync(scriptPath, 'utf8');

const replacements = {
    'YOUR_OPENROUTER_API_KEY': process.env.OPENROUTER_API_KEY,
    'YOUR_HUGGINGFACE_TOKEN': process.env.HUGGINGFACE_TOKEN
};

let count = 0;
for (const [placeholder, value] of Object.entries(replacements)) {
    if (value) {
        console.log(`Injecting secret for ${placeholder}...`);
        const newContent = content.replace(new RegExp(placeholder, 'g'), value);
        if (newContent !== content) {
            content = newContent;
            count++;
        } else {
            console.warn(`Warning: Placeholder ${placeholder} not found in script.js`);
        }
    } else {
        console.error(`Error: Environment variable for ${placeholder} is missing!`);
    }
}

if (count > 0) {
    fs.writeFileSync(scriptPath, content);
    console.log(`Successfully injected ${count} secrets.`);
} else {
    console.error('No secrets were injected. Build may fail to function correctly.');
    process.exit(1);
}
