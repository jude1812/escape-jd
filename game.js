const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Accès aux nœuds HTML du DOM
const menuOverlay = document.getElementById("menu-overlay");
const menuTitle = document.getElementById("menu-title");
const menuSubtitle = document.getElementById("menu-subtitle");
const startBtn = document.getElementById("start-btn");
const scoreDisplay = document.getElementById("score-board");
const livesDisplay = document.getElementById("lives-count");
const premiumBtn = document.getElementById("premium-btn");
const reviveBtn = document.getElementById("revive-btn");
const lockZone = document.getElementById("lock-zone");
const countdownDisplay = document.getElementById("countdown");
const watch2AdsBtn = document.getElementById("watch-2-ads-btn");

// Etats de configuration du Core Engine
let gameRunning = false;
let score = 0;
let isPremium = false;
let canRevive = true; 
let obstacles = [];
let spawnTimer = 0;

// Variables de gestion monétisation (18 essais / 10 minutes)
const MAX_LIVES = 18;
let currentLives = 18;
let lockTimeEnd = null;
let timerInterval = null;
let adsWatchedCounter = 0; 

// --- GENERATEUR DE GRAPHISMES ET DECORS EN CODE ---
const backgroundRenderer = {
    skyGradient: null,
    gridLines: [],

    init: function() {
        this.skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        this.skyGradient.addColorStop(0, "#0f111a"); // Ambiance Cyber Synthwave
        this.skyGradient.addColorStop(0.6, "#171a26");
        this.skyGradient.addColorStop(1, "#23283b");

        // Pré-génération des lignes de perspective de la grille au sol
        for (let i = -100; i <= canvas.width + 100; i += 40) {
            this.gridLines.push(i);
        }
    },

    draw: function() {
        // Rendu du fond
        ctx.fillStyle = this.skyGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dessin du sol fixe
        ctx.fillStyle = "#090b11";
        ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

        // Néon rouge d'horizon
        ctx.fillStyle = "#ff4757";
        ctx.fillRect(0, canvas.height - 60, canvas.width, 2);

        // Animation de perspective au sol (simulation de mouvement vers la gauche)
        ctx.strokeStyle = "rgba(255, 71, 87, 0.15)";
        ctx.lineWidth = 2;
        this.gridLines.forEach((lineX, index) => {
            ctx.beginPath();
            ctx.moveTo(lineX, canvas.height - 60);
            ctx.lineTo(lineX - 40, canvas.height);
            ctx.stroke();

            if (gameRunning) {
                this.gridLines[index] -= 2.5; // Défilement
            }
            if (this.gridLines[index] < -100) {
                this.gridLines[index] = canvas.width + 40;
            }
        });
    }
};

// --- LOGIQUE OBJET DU JOUEUR (AVATAR) ---
const playerObject = {
    x: 65,
    y: 240,
    radius: 14,
    gravity: 0.42,
    lift: -8.2,
    velocity: 0,

    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Effet de halo lumineux autour de l'entité
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ff4757";

        // Dessin sphérique du joueur (Rouge Néon)
        ctx.fillStyle = "#ff4757";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    },

    update: function() {
        this.velocity += this.gravity;
        this.y += this.velocity;

        // Collision fatale avec le sol
        if (this.y + this.radius > canvas.height - 60) {
            this.y = canvas.height - 60 - this.radius;
            triggerGameOver();
        }
        // Sécurité plafond
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.velocity = 0;
        }
    },

    jump: function() {
        if (gameRunning) {
            this.velocity = this.lift;
        }
    }
};

// --- LOGIQUE OBSTACLES (CONES ENNEMIS) ---
class ObstacleEntity {
    constructor() {
        this.x = canvas.width;
        this.width = 55;
        this.speed = 3.6;
        this.passed = false;

        const gapSpace = 135; // Espacement de passage
        this.topHeight = Math.random() * (canvas.height - gapSpace - 180) + 50;
        this.bottomY = this.topHeight + gapSpace;
        this.bottomHeight = canvas.height - 60 - this.bottomY;
    }

    draw() {
        ctx.fillStyle = "#2ed573"; // Couleur vert électrique contrastée
        ctx.strokeStyle = "#0b0e17";
        ctx.lineWidth = 2;

        // Structure Supérieure
        ctx.fillRect(this.x, 0, this.width, this.topHeight);
        ctx.strokeRect(this.x, 0, this.width, this.topHeight);

        // Structure Inférieure
        ctx.fillRect(this.x, this.bottomY, this.width, this.bottomHeight);
        ctx.strokeRect(this.x, this.bottomY, this.width, this.bottomHeight);
    }

    update() {
        this.x -= this.speed;
    }
}

// --- DÉMARRAGE DU RUN ---
function startSession() {
    if (!isPremium && currentLives <= 0) {
        alert("Action impossible : Vous n'avez plus d'essais. Veuillez recharger par pub ou attendre.");
        return;
    }

    score = 0;
    scoreDisplay.innerText = score;
    obstacles = [];
    playerObject.y = 240;
    playerObject.velocity = 0;
    canRevive = true;
    gameRunning = true;
    menuOverlay.classList.remove("active");
}

// --- FIN DE SESSION (DEATH OVER) ---
function triggerGameOver() {
    if (!gameRunning) return;
    gameRunning = false;

    if (!isPremium) {
        currentLives--; // Retrait d'une unité d'énergie
        livesDisplay.innerText = currentLives;
    }

    menuTitle.innerText = "GAME OVER";
    menuSubtitle.innerText = `SCORE ATTEINT : ${score}`;
    startBtn.innerText = "REJOUER";

    // Branchement de la restriction d'accès à 0 vie
    if (currentLives <= 0 && !isPremium) {
        startBtn.classList.add("hidden");
        lockZone.classList.remove("hidden");
        launchLockCountdown();
    } else {
        if (!isPremium && canRevive) {
            reviveBtn.classList.remove("hidden");
        }
    }

    menuOverlay.classList.add("active");
}

// --- ALGORITHME DE COMPTE À REBOURS (10 MINUTES) ---
function launchLockCountdown() {
    if (timerInterval) clearInterval(timerInterval);
    
    // Détermination de la cible (10 min plus tard)
    lockTimeEnd = Date.now() + 10 * 60 * 1000;

    timerInterval = setInterval(() => {
        let timeRemaining = lockTimeEnd - Date.now();

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            rechargeFullLives();
        } else {
            let mins = Math.floor(timeRemaining / 60000);
            let secs = Math.floor((timeRemaining % 60000) / 1000);
            countdownDisplay.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
    }, 1000);
}

function rechargeFullLives() {
    currentLives = MAX_LIVES;
    livesDisplay.innerText = currentLives;
    startBtn.classList.remove("hidden");
    lockZone.classList.add("hidden");
    if (timerInterval) clearInterval(timerInterval);
}

// --- CONSOMMATION DU CLIP DE 2 PUBS (EVITEMENT DU TIMER) ---
watch2AdsBtn.addEventListener("click", () => {
    if (typeof adBreak === 'function') {
        adBreak({
            type: 'reward',
            name: 'unlock-lives',
            beforeAd: () => { console.log("Lancement de la pub AdSense"); },
            afterAd: () => { console.log("Fin de la pub"); },
            adViewed: () => {
                adsWatchedCounter++;
                if (adsWatchedCounter >= 2) {
                    alert("🎬 Deuxième vidéo validée ! Vos 18 essais sont rechargés.");
                    adsWatchedCounter = 0;
                    rechargeFullLives();
                } else {
                    alert("🎬 Première vidéo terminée. Encore une !");
                }
            }
        });
    } else {
        // Mode de secours si AdSense est en cours de validation par Google
        adsWatchedCounter++;
        if (adsWatchedCounter >= 2) {
            rechargeFullLives();
            adsWatchedCounter = 0;
        }
    }
});

// --- ROUTAGE UNIQUE PASSERELLE STRIPE CHECKOUT (1.00€) ---
premiumBtn.addEventListener("click", async () => {
    try {
        console.log("[STRIPE] Initialisation de l'API externe sécurisée...");
        
        // Chargement à la volée du script Stripe officiel si absent
        if (!window.Stripe) {
            await new Promise((resolve, reject) => {
                const scriptEl = document.createElement('script');
                scriptEl.src = 'https://js.stripe.com/v3/';
                scriptEl.onload = resolve;
                scriptEl.onerror = reject;
                document.head.appendChild(scriptEl);
            });
        }

        // Configuration d'authentification (Clé Stripe Marchand)
        // Remplacer 'pk_test_...' par ta clé Stripe Marchand publique définitive
        const stripeInstance = Stripe('pk_test_Insère_Ta_Cle_Stripe_Publique_Ici');

        alert("🔄 Connexion sécurisée établie.\nRedirection vers le formulaire bancaire crypté (CB, Apple Pay, Google Pay)...");
        
        // REDIRECTION COMMERCIALE : Colle ici l'adresse unique générée dans ton tableau Stripe
        window.location.href = "https://buy.stripe.com/Insère_Ton_Lien_De_Paiement_Stripe_Checkout_Ici";

    } catch (err) {
        alert("Erreur passerelle bancaire : " + err.message);
    }
});

// Pub de résurrection immédiate (Bonus in-game)
reviveBtn.addEventListener("click", () => {
    alert("🎬 Publicité lue. L'avatar réapparaît en course !");
    reviveBtn.classList.add("hidden");
    canRevive = false;
    playerObject.y = 240;
    playerObject.velocity = 0;
    obstacles = [];
    gameRunning = true;
    menuOverlay.classList.remove("active");
});

// --- RUNTIME LOOP PRINCIPAL (60 FPS RENDERING) ---
backgroundRenderer.init();

function mainEngineLoop() {
    backgroundRenderer.draw();

    if (gameRunning) {
        playerObject.update();

        spawnTimer++;
        if (spawnTimer % 85 === 0) {
            obstacles.push(new ObstacleEntity());
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].update();
            obstacles[i].draw();

            // Matrice de calcul d'impact
            let p = playerObject;
            let o = obstacles[i];
            if (p.x + p.radius > o.x && p.x - p.radius < o.x + o.width) {
                if (p.y - p.radius < o.topHeight || p.y + p.radius > o.bottomY) {
                    triggerGameOver();
                }
            }

            // Incrémentation des scores
            if (!o.passed && o.x + o.width < p.x) {
                score++;
                scoreDisplay.innerText = score;
                o.passed = true;
            }

            // Flush de la pile mémoire
            if (o.x + o.width < 0) {
                obstacles.splice(i, 1);
            }
        }
    }

    playerObject.draw();
    requestAnimationFrame(mainEngineLoop);
}

// --- MAILING DES ECOUTEURS D'EVENEMENTS DE CONTROLES ---
window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") playerObject.jump();
});
canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    playerObject.jump();
}, { passive: false });
canvas.addEventListener("mousedown", () => {
    playerObject.jump();
});

startBtn.addEventListener("click", startSession);

// Lancement automatique du thread de traitement
mainEngineLoop();