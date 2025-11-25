import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

admin.initializeApp();

const TWENTY_API_URL = 'https://crm.osceia.org.br/rest';
// O token deve ser configurado como uma variável de ambiente secreta no Firebase Functions
// Ex: firebase functions:config:set twenty.token="SEU_TOKEN_AQUI"
const TWENTY_API_TOKEN = process.env.TWENTY_TOKEN;

if (!TWENTY_API_TOKEN) {
    functions.logger.error('TWENTY_API_TOKEN não está configurado. As funções de sincronização não funcionarão.');
}

/**
 * Busca um "people" no Twenty CRM pelo email.
 * @param email O email do usuário.
 * @returns O ID do people ou null se não encontrado.
 */
async function findTwentyPersonIdByEmail(email: string): Promise<string | null> {
    if (!TWENTY_API_TOKEN) {
        throw new Error('Twenty CRM API Token não configurado.');
    }

    // A API do Twenty CRM usa um endpoint /people com filtro.
    // Assumindo que o filtro é passado via query parameter 'filter' ou 'where'.
    // Baseado na estrutura de APIs REST modernas, vamos tentar um filtro simples.
    // Se o Twenty CRM usar um formato de filtro específico (ex: GraphQL-like),
    // o usuário precisará ajustar esta parte.
    const filter = JSON.stringify({ email: { eq: email } });
    const url = `${TWENTY_API_URL}/people?filter=${encodeURIComponent(filter)}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${TWENTY_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        // Assumindo que a resposta retorna um array de pessoas em 'data.people'
        const people = response.data?.data?.people || [];

        if (people.length > 0) {
            // Retorna o ID do primeiro people encontrado
            return people[0].id;
        }

        return null;
    } catch (error) {
        functions.logger.error('Erro ao buscar people no Twenty CRM:', error);
        // Em caso de erro de rede/API, tratamos como se não tivesse perfil para não bloquear o login.
        // O log de erro ajudará no debug.
        return null;
    }
}

/**
 * Sincroniza o usuário do Firebase com o Twenty CRM e define custom claims.
 * @param user O objeto UserRecord do Firebase.
 */
async function syncUserAndSetClaims(user: admin.auth.UserRecord): Promise<void> {
    const { uid, email } = user;

    if (!email) {
        functions.logger.warn(`Usuário ${uid} não possui email. Pulando sincronização.`);
        return;
    }

    functions.logger.info(`Iniciando sincronização para o usuário ${uid} com email ${email}`);

    let hasProfile = false;
    let twentyPersonId: string | undefined;

    try {
        const personId = await findTwentyPersonIdByEmail(email);

        if (personId) {
            hasProfile = true;
            twentyPersonId = personId;
            functions.logger.info(`Perfil encontrado no Twenty CRM. ID: ${personId}`);
        } else {
            // Regra de negócio definida pelo usuário: apenas marcar hasProfile: false
            hasProfile = false;
            functions.logger.info('Perfil NÃO encontrado no Twenty CRM. Marcando hasProfile: false.');
        }

        const customClaims = {
            hasProfile: hasProfile,
            ...(twentyPersonId && { twentyPersonId: twentyPersonId }),
        };

        // Define os custom claims no usuário
        await admin.auth().setCustomUserClaims(uid, customClaims);
        functions.logger.info(`Custom claims definidos para o usuário ${uid}:`, customClaims);

    } catch (error) {
        functions.logger.error(`Erro fatal na sincronização do usuário ${uid}:`, error);
        // Em caso de erro, não definimos claims para forçar o front a tentar novamente ou cair em um fluxo de erro.
    }
}

// 1. Gatilho onCreate: Dispara quando um novo usuário é criado no Firebase Auth
export const syncUserOnCreate = functions.auth.user().onCreate(async (user) => {
    return syncUserAndSetClaims(user);
});

// 2. Função Callable: Pode ser chamada explicitamente pelo frontend (útil para usuários antigos ou forçar revalidação)
export const syncUserWithTwentyCallable = functions.https.onCall(async (data, context) => {
    // 1. Segurança: Verifica se o usuário está autenticado
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'A função deve ser chamada por um usuário autenticado.'
        );
    }

    const { uid, token } = context.auth;
    const email = token.email;

    if (!email) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'O token de autenticação não contém um email válido.'
        );
    }

    // 2. Idempotência e Sincronização
    await syncUserAndSetClaims({ uid, email } as admin.auth.UserRecord);

    // 3. Retorna os novos claims para o frontend
    const user = await admin.auth().getUser(uid);
    return {
        customClaims: user.customClaims,
        message: 'Sincronização concluída com sucesso. Claims atualizados.'
    };
});
