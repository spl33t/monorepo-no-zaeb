import { initContract } from "@monorepo/contract-page-2";

// 1️⃣ Контракт с AppContext
const contractWithCtx = initContract({
  appContext: async () => ({ userId: '123' }),
});

export const profilePage = contractWithCtx.definePage({
  path: '/profile/:id',
  page: ({ appContext, params }) => {

    if (Number(params.id) !== 100) {
      return { type: "not-found", data: { message: `Profile ${params.id} not found` } }
    }

    return {
      type: 'ok',
      data: {
        userId: appContext.userId,
        profileId: params.id,
      },
    }
  },
});


export const homePage = contractWithCtx.definePage({
  path: "home",
  page: () => {
    return {
      type: 'ok'
    }
  },
})

