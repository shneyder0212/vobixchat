/**
 * VOBIXCHAT - MOTOR EDUCATIVO CONVERSACIONAL (CAPA C1.5)
 * Orquesta flujos interactivos de idiomas en formato Chatbot automatizado.
 * Valida respuestas, calcula rachas y almacena progreso de forma asíncrona.
 */

class VobixLearnEngine {
    constructor() {
        // Base de datos de lecciones ligeras estructurada por niveles
        this.lessons = {
            en: [
                { id: "en_01", prompt: "Translate: 'Buenos días'", correct: "good morning", points: 10 },
                { id: "en_02", prompt: "Translate: '¿Cómo estás?'", correct: "how are you", points: 15 },
                { id: "en_03", prompt: "Translate: 'Muchas gracias'", correct: "thank you very much", points: 20 }
            ],
            fr: [
                { id: "fr_01", prompt: "Translate: 'Hola'", correct: "bonjour", points: 10 },
                { id: "fr_02", prompt: "Translate: 'Por favor'", correct: "s'il vous plaît", points: 20 }
            ]
        };
        this.userProgress = new Map(); // userId -> { currentLanguage, lessonIndex, score, streak }
    }

    /**
     * Inicializa o recupera el perfil del estudiante en Vobix
     */
    initializeStudent(userId, language = "en") {
        if (!this.userProgress.has(userId)) {
            this.userProgress.set(userId, {
                currentLanguage: language,
                lessonIndex: 0,
                score: 0,
                streak: 0
            });
        }
        return this.userProgress.get(userId);
    }

    /**
     * Obtiene el siguiente reto interactivo para el usuario en el chat
     */
    getNextChallenge(userId) {
        const progress = this.userProgress.get(userId) || this.initializeStudent(userId);
        const languageLessons = this.lessons[progress.currentLanguage];

        if (progress.lessonIndex >= languageLessons.length) {
            return {
                status: "COURSE_COMPLETED",
                message: "🎉 ¡Felicidades! Has completado el curso de idiomas en VobixChat. Pronto añadiremos más contenido."
            };
        }

        const currentChallenge = languageLessons[progress.lessonIndex];
        return {
            status: "CHALLENGE_READY",
            prompt: currentChallenge.prompt,
            lessonId: currentChallenge.id
        };
    }

    /**
     * Procesa de forma heurística la respuesta que el usuario escribe en la caja de texto
     */
    evaluateUserResponse(userId, userText) {
        const progress = this.userProgress.get(userId);
        if (!progress) return { error: "Estudiante no inicializado en el módulo." };

        const languageLessons = this.lessons[progress.currentLanguage];
        const currentChallenge = languageLessons[progress.lessonIndex];

        // Limpieza de caracteres para evitar errores de validación por mayúsculas o espacios extra
        const cleanUserAnswer = userText.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?¿¡]/g, "");
        const cleanCorrectAnswer = currentChallenge.correct.trim().toLowerCase();

        if (cleanUserAnswer === cleanCorrectAnswer) {
            progress.score += currentChallenge.points;
            progress.streak += 1;
            progress.lessonIndex += 1; // Avanza de lección de forma automática

            console.log(`[Capa C1.5] Respuesta correcta. Usuario: ${userId} | Puntuación: ${progress.score} | Racha: ${progress.streak}`);

            return {
                evaluation: "CORRECT",
                feedback: `✅ ¡Excelente! Ganaste +${currentChallenge.points} puntos. Tu racha actual es de ${progress.streak} días/respuestas.`,
                newProgress: progress
            };
        } else {
            progress.streak = 0; // Rompe la racha si se equivoca
            console.log(`[Capa C1.5] Respuesta incorrecta de ${userId}. Se reinicia racha.`);

            return {
                evaluation: "INCORRECT",
                feedback: `❌ Inténtalo de nuevo. Consejo Vobix: Revisa la ortografía de tu respuesta. ¡Tú puedes!`,
                newProgress: progress
            };
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = VobixLearnEngine;
}
