const { Client, GatewayIntentBits, Partials, PermissionsBitField, REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
require('dotenv').config();

// التحقق من وجود المتغيرات البيئية المطلوبة
if (!process.env.STABILITY_API_KEY || !process.env.GEMINI_API_KEY) {
    console.error('خطأ: لم يتم العثور على جميع مفاتيح API المطلوبة.');
    console.error('يرجى التأكد من وجود الملف .env مع المتغيرات التالية:');
    console.error('STABILITY_API_KEY, GEMINI_API_KEY');
    process.exit(1);
}

// إعداد Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// نظام الردود الذكي
const smartResponses = {
    greetings: {
        patterns: ['سلام', 'مرحبا', 'هاي', 'هلا', 'صباح', 'مساء', 'اهلا', 'السلام', 'صباح الخير', 'مساء الخير'],
        replies: [
            'وعليكم السلام ورحمة الله وبركاته 😊',
            'أهلاً وسهلاً! كيف حالك؟ 🌟',
            'مرحباً بك! يسعدني التحدث معك 💫'
        ]
    },
    howAreYou: {
        patterns: ['كيف حالك', 'شلونك', 'عامل ايه', 'كيفك', 'كيف الحال', 'عامل اية', 'شخبارك'],
        replies: [
            'الحمد لله بخير! كيف حالك أنت؟ 😊',
            'بخير والحمد لله! أتمنى أن تكون بخير أيضاً 🌟',
            'ممتاز! يسعدني سؤالك عن حالي 💫'
        ]
    },
    thanks: {
        patterns: ['شكرا', 'شكراً', 'تسلم', 'جزاك', 'مشكور', 'يعطيك العافية', 'الله يجزاك'],
        replies: [
            'العفو! سعيد بمساعدتك 😊',
            'لا شكر على واجب! 🌟',
            'أنا هنا لخدمتك دائماً 💫'
        ]
    },
    help: {
        patterns: ['ساعد', 'مساعدة', 'احتاج', 'ممكن', 'اريد', 'أريد', 'محتاج', 'تقدر', 'تكدر', 'بدي'],
        replies: [
            'بالتأكيد! كيف يمكنني مساعدتك؟ 😊',
            'أنا هنا لمساعدتك! ما الذي تحتاجه؟ 🌟',
            'يسعدني مساعدتك! تفضل بطرح سؤالك 💫'
        ]
    },
    questions: {
        patterns: ['ما هي', 'ماهي', 'ما هو', 'ماهو', 'كيف', 'متى', 'لماذا', 'ليش', 'وين', 'اين', 'أين', 'شلون'],
        replies: [
            'سأحاول مساعدتك في الإجابة على سؤالك. هل يمكنك توضيح المزيد؟ 🤔',
            'أنا هنا للإجابة على أسئلتك. كيف يمكنني مساعدتك بشكل أفضل؟ 💭',
            'سؤال جيد! دعني أساعدك في الحصول على إجابة مفيدة 📚'
        ]
    },
    general: {
        patterns: [],
        replies: [
            'أفهم ما تقول. هل يمكنني مساعدتك في شيء محدد؟ 🤝',
            'أنا هنا للمساعدة! هل لديك سؤال معين؟ 💡',
            'يمكنني مساعدتك بشكل أفضل إذا كان لديك طلب محدد 🎯'
        ]
    }
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildIntegrations
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// دالة للحصول على رد من Gemini
async function getGeminiResponse(message) {
    try {
        const prompt = `أنت مساعد ذكي ودود تتحدث العربية. الرسالة: "${message}"
        يجب أن يكون ردك:
        1. مختصراً ومفيداً
        2. باللغة العربية الفصحى
        3. ودوداً ومحترماً
        4. يتضمن إيموجي مناسبة
        5. لا يتجاوز 3 أسطر

        إذا كان السؤال عن الألعاب، قدم اقتراحات محددة لأفضل الألعاب في تلك الفئة.
        إذا كان السؤال عاماً، اطلب توضيحاً أكثر.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('خطأ في الحصول على رد من Gemini:', error);
        return getSmartResponse(message); // استخدام النظام الاحتياطي
    }
}

// دالة لإنشاء الصور باستخدام Stability AI
async function generateImage(prompt, style = 'digital-art') {
    try {
        // ترجمة النص العربي إلى الإنجليزية
        const englishPrompt = await translatePrompt(prompt);
        console.log('الوصف بالإنجليزية:', englishPrompt);

        // تحسين الوصف حسب النمط
        const styleEnhancements = {
            'digital-art': ', digital art style, vibrant colors, detailed, 8k resolution, trending on artstation, professional digital artwork',
            'anime': ', anime style, studio ghibli inspired, detailed character design, vibrant colors, beautiful lighting',
            'realistic': ', photorealistic, highly detailed, professional photography, 8k resolution, natural lighting, sharp focus',
            'painting': ', oil painting, masterpiece, detailed brushstrokes, professional artwork, gallery quality, artistic',
            '3d': ', 3D render, octane render, cinema 4D, highly detailed, professional 3D modeling, realistic textures, volumetric lighting'
        };

        const negativePrompt = 'bad quality, blurry, distorted, deformed, ugly, bad anatomy, poor lighting, poor composition, low resolution, amateur';

        const enhancedPrompt = englishPrompt + (styleEnhancements[style] || styleEnhancements['digital-art']);

        const response = await axios({
            method: 'post',
            url: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`
            },
            data: {
                text_prompts: [
                    {
                        text: enhancedPrompt,
                        weight: 1
                    },
                    {
                        text: negativePrompt,
                        weight: -1
                    }
                ],
                cfg_scale: 8,
                height: 1024,
                width: 1024,
                steps: 50,
                samples: 1,
                style_preset: style === 'anime' ? 'anime' : 'photographic',
                sampler: 'DDIM'
            }
        });

        if (response.data && response.data.artifacts && response.data.artifacts.length > 0) {
            return response.data.artifacts[0].base64;
        } else {
            throw new Error('لم يتم استلام بيانات الصورة');
        }
    } catch (error) {
        console.error('خطأ في إنشاء الصورة:', error.response?.data || error.message);
        throw error;
    }
}

// دالة لترجمة النص العربي إلى الإنجليزية
async function translatePrompt(arabicText) {
    try {
        const result = await model.generateContent(`
            أنت خبير في ترجمة الأوصاف العربية إلى الإنجليزية لإنشاء الصور.
            قم بترجمة النص التالي مع:
            1. الحفاظ على جميع التفاصيل المهمة
            2. إضافة تفاصيل وصفية إضافية تحسن جودة الصورة
            3. استخدام مصطلحات فنية مناسبة
            4. تجنب الترجمة الحرفية واستخدام تعبيرات طبيعية
            
            النص العربي: "${arabicText}"
            
            قم بإعطاء الترجمة فقط بدون أي نص إضافي.
        `);
        const response = await result.response;
        const translatedText = response.text()
            .replace(/^["']|["']$/g, '') // إزالة علامات التنصيص
            .trim();
        
        console.log('النص الأصلي:', arabicText);
        console.log('الترجمة:', translatedText);
        
        return translatedText;
    } catch (error) {
        console.error('خطأ في الترجمة:', error);
        return arabicText;
    }
}

// دالة للحصول على رد مناسب
function getSmartResponse(message) {
    try {
        console.log('تحليل الرسالة:', message);
        const text = message.trim();
        
        // البحث عن تطابق في كل فئة
        for (const category in smartResponses) {
            console.log('فحص الفئة:', category);
            for (const pattern of smartResponses[category].patterns) {
                // تحويل النص والنمط إلى أحرف صغيرة للمقارنة
                const normalizedText = text.toLowerCase().replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/ة/g, 'ه');
                const normalizedPattern = pattern.toLowerCase().replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/ة/g, 'ه');
                
                if (normalizedText.includes(normalizedPattern)) {
                    console.log('تم العثور على تطابق:', pattern);
                    const replies = smartResponses[category].replies;
                    return replies[Math.floor(Math.random() * replies.length)];
                }
            }
        }
        
        // إذا كان السؤال يبدأ بـ "ما هي" أو "ماهي"
        if (text.match(/^(ما|ماذا|كيف|متى|اين|أين|لماذا)\s/i)) {
            console.log('تم اكتشاف سؤال');
            return smartResponses.questions.replies[Math.floor(Math.random() * smartResponses.questions.replies.length)];
        }
        
        console.log('لم يتم العثور على تطابق، استخدام الرد العام');
        return smartResponses.general.replies[Math.floor(Math.random() * smartResponses.general.replies.length)];
    } catch (error) {
        console.error('خطأ في دالة getSmartResponse:', error);
        return 'عذراً، حدث خطأ في معالجة الرسالة.';
    }
}

client.once('ready', async () => {
    console.log(`تم تشغيل البوت بنجاح: ${client.user.tag}`);
    console.log('قائمة السيرفرات:');
    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (${guild.id})`);
    });
    
    try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        
        // تسجيل الأوامر في كل السيرفرات
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
            console.log(`محاولة تسجيل الأوامر في السيرفر: ${guild.name}`);
            try {
                await rest.put(
                    Routes.applicationGuildCommands(client.user.id, guildId),
                    {
                        body: [
                            {
                                name: 'ai',
                                description: 'أوامر الذكاء الاصطناعي',
                                options: [
                                    {
                                        name: 'setup',
                                        description: 'تفعيل الذكاء الاصطناعي في هذه القناة',
                                        type: ApplicationCommandOptionType.Subcommand
                                    },
                                    {
                                        name: 'disable',
                                        description: 'تعطيل الذكاء الاصطناعي في هذه القناة',
                                        type: ApplicationCommandOptionType.Subcommand
                                    },
                                    {
                                        name: 'status',
                                        description: 'عرض حالة الذكاء الاصطناعي في هذه القناة',
                                        type: ApplicationCommandOptionType.Subcommand
                                    },
                                    {
                                        name: 'image',
                                        description: 'إنشاء صورة باستخدام الذكاء الاصطناعي',
                                        type: ApplicationCommandOptionType.Subcommand,
                                        options: [
                                            {
                                                name: 'prompt',
                                                description: 'وصف الصورة التي تريد إنشاءها',
                                                type: ApplicationCommandOptionType.String,
                                                required: true
                                            },
                                            {
                                                name: 'style',
                                                description: 'نمط الصورة',
                                                type: ApplicationCommandOptionType.String,
                                                required: false,
                                                choices: [
                                                    { name: 'فن رقمي', value: 'digital-art' },
                                                    { name: 'أنمي', value: 'anime' },
                                                    { name: 'واقعي', value: 'realistic' },
                                                    { name: 'لوحة زيتية', value: 'painting' },
                                                    { name: 'ثلاثي الأبعاد', value: '3d' }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                );
                console.log(`تم تسجيل الأوامر بنجاح في السيرفر: ${guild.name}`);
            } catch (guildError) {
                console.error(`خطأ في تسجيل الأوامر للسيرفر ${guild.name}:`, guildError);
            }
        }
    } catch (error) {
        console.error('خطأ في تسجيل الأوامر:', error);
    }
    
    console.log('البوت جاهز للعمل!');
    console.log('القنوات المفعلة:', config.aiChannels);
});

// التعامل مع الأوامر
client.on('interactionCreate', async interaction => {
    try {
        console.log('تفاعل جديد:', interaction.commandName);
        
        if (!interaction.isCommand()) return;

        if (interaction.commandName === 'ai') {
            const subcommand = interaction.options.getSubcommand();
            console.log('الأمر الفرعي:', subcommand);

            try {
                await interaction.deferReply();

                if (subcommand === 'setup') {
                    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
                        return interaction.editReply({ content: 'عذراً، هذا الأمر متاح فقط للمشرفين.', ephemeral: true });
                    }

                    if (!config.aiChannels) {
                        config.aiChannels = [];
                    }

                    if (config.aiChannels.includes(interaction.channelId)) {
                        return interaction.editReply({ content: 'هذه القناة مفعلة بالفعل كقناة ذكاء اصطناعي.', ephemeral: true });
                    }

                    config.aiChannels.push(interaction.channelId);
                    fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
                    console.log('تم تحديث القنوات المفعلة:', config.aiChannels);
                    
                    await interaction.editReply({ content: 'تم إعداد هذه القناة بنجاح كقناة ذكاء اصطناعي! 🎉' });
                }
                else if (subcommand === 'disable') {
                    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
                        return interaction.editReply({ content: 'عذراً، هذا الأمر متاح فقط للمشرفين.', ephemeral: true });
                    }

                    if (!config.aiChannels) {
                        config.aiChannels = [];
                    }

                    const index = config.aiChannels.indexOf(interaction.channelId);
                    if (index === -1) {
                        return interaction.editReply({ content: 'هذه القناة غير مفعلة كقناة ذكاء اصطناعي.', ephemeral: true });
                    }

                    config.aiChannels.splice(index, 1);
                    fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
                    console.log('تم تحديث القنوات المفعلة:', config.aiChannels);
                    
                    await interaction.editReply({ content: 'تم تعطيل الذكاء الاصطناعي في هذه القناة.' });
                }
                else if (subcommand === 'status') {
                    if (!config.aiChannels) {
                        config.aiChannels = [];
                    }
                    const isEnabled = config.aiChannels.includes(interaction.channelId);
                    await interaction.editReply({ content: `حالة الذكاء الاصطناعي في هذه القناة: ${isEnabled ? '✅ مفعل' : '❌ معطل'}` });
                }
                else if (subcommand === 'image') {
                    const prompt = interaction.options.getString('prompt');
                    const style = interaction.options.getString('style') || 'digital-art';
                    console.log('طلب إنشاء صورة:', prompt, 'النمط:', style);

                    try {
                        await interaction.editReply({ content: 'جاري إنشاء الصورة... ⏳\nقد تستغرق العملية بضع ثوانٍ.' });
                        
                        const imageBase64 = await generateImage(prompt, style);
                        const imageBuffer = Buffer.from(imageBase64, 'base64');
                        
                        await interaction.editReply({ 
                            content: `تم إنشاء الصورة! 🎨\nالوصف: ${prompt}\nالنمط: ${style}`,
                            files: [{
                                attachment: imageBuffer,
                                name: `generated-image-${style}.png`
                            }]
                        });
                        
                        console.log('تم إنشاء الصورة بنجاح');
                    } catch (imageError) {
                        console.error('خطأ في إنشاء الصورة:', imageError);
                        await interaction.editReply({ 
                            content: 'عذراً، حدث خطأ أثناء إنشاء الصورة. الرجاء المحاولة مرة أخرى.\nتأكد من أن الوصف مناسب وغير محظور.',
                            ephemeral: true 
                        });
                    }
                }
            } catch (commandError) {
                console.error('خطأ في تنفيذ الأمر:', commandError);
                if (interaction.deferred) {
                    await interaction.editReply({ content: 'عذراً، حدث خطأ أثناء تنفيذ الأمر. الرجاء المحاولة مرة أخرى.' });
                } else {
                    await interaction.reply({ content: 'عذراً، حدث خطأ أثناء تنفيذ الأمر. الرجاء المحاولة مرة أخرى.', ephemeral: true });
                }
            }
        }
    } catch (error) {
        console.error('خطأ في معالجة التفاعل:', error);
    }
});

// التعامل مع الرسائل
client.on('messageCreate', async message => {
    try {
        if (message.author.bot) return;
        
        console.log(`رسالة جديدة في القناة ${message.channel.id} من ${message.author.tag}: ${message.content}`);
        console.log('القنوات المفعلة:', config.aiChannels);
        
        if (!config.aiChannels) {
            config.aiChannels = [];
        }

        if (config.aiChannels.includes(message.channel.id)) {
            console.log('القناة مفعلة للذكاء الاصطناعي');
            
            try {
                // إظهار أن البوت يكتب
                await message.channel.sendTyping();
                
                // محاولة الحصول على رد من Gemini أولاً
                let response;
                try {
                    response = await getGeminiResponse(message.content);
                } catch (geminiError) {
                    console.error('خطأ في Gemini:', geminiError);
                    response = getSmartResponse(message.content);
                }
                
                console.log('الرد المختار:', response);
                
                // إرسال الرد
                const reply = await message.reply({ content: response, failIfNotExists: false });
                console.log('تم إرسال الرد:', reply.content);
                
            } catch (error) {
                console.error('خطأ في معالجة الرسالة:', error);
                await message.reply({ 
                    content: 'عذراً، حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى.',
                    failIfNotExists: false 
                });
            }
        } else {
            console.log('القناة غير مفعلة للذكاء الاصطناعي');
        }
    } catch (error) {
        console.error('خطأ في معالجة الرسالة:', error);
    }
});

// معالجة الأخطاء العامة
client.on('error', error => {
    console.error('خطأ في البوت:', error);
});

client.on('warn', warning => {
    console.warn('تحذير من البوت:', warning);
});

client.on('debug', info => {
    console.log('معلومات التصحيح:', info);
});

// تسجيل الدخول للبوت
console.log('محاولة تسجيل الدخول...');
client.login(config.token).then(() => {
    console.log('تم تسجيل الدخول بنجاح!');
}).catch(error => {
    console.error('خطأ في تسجيل الدخول:', error);
}); 