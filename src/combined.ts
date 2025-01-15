import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
import mongoose from 'mongoose';

export type Ingredient = {
    name: string
    quantity?: number | null
    id: string
}

// Type for dietary preferences in client
export type DietaryPreference = 'Vegetarian' | 'Vegan' | 'Gluten-Free' | 'Keto' | 'Paleo';

interface RecipeIngredient {
    name: string;
    quantity: string;
}

interface AdditionalInformation {
    tips: string;
    variations: string;
    servingSuggestions: string;
    nutritionalInformation: string;
}

export interface Recipe {
    name: string;
    ingredients: RecipeIngredient[];
    instructions: string[];
    dietaryPreference: string[];
    additionalInformation: AdditionalInformation;
    openaiPromptId: string
}

// this is for raw recipe documents to be stored in the db
interface tagType {
    _id: string,
    tag: string,
}

interface unPopulatedComment {
    _id: mongoose.Types.ObjectId,
    user: mongoose.Types.ObjectId,
    comment: string,
    createdAt: string,
  }


export interface RecipeDocument extends Recipe {
    owner: mongoose.Types.ObjectId
    imgLink: string
    likedBy: mongoose.Types.ObjectId[]
    comments: unPopulatedComment[],
    createdAt: string,
    tags: tagType[],
}

// this is for recipes returned from the db back to the client or those returned from populated mongoose queries
export interface ExtendedRecipe extends Recipe {
    _id: string
    imgLink: string
    owner:{
        _id: string
        name: string
        image: string
    }
    createdAt: string
    updatedAt: string
    likedBy: {
        _id: string
        name: string
        image: string
    }[]
    owns: boolean
    liked: boolean
}

export interface IngredientDocumentType {
    _id: string,
    name: string,
    createdBy: string | null,
    createdAt: string,
}

export interface UploadReturnType { 
    location: string, 
    uploaded: boolean 
}import axios from "axios";
import { getSession } from 'next-auth/react';
import { ExtendedRecipe } from "../types";
import { GetServerSidePropsContext } from "next";

// Filters the results by enhancing recipe information with ownership and liked status for the user
export const filterResults = (recipes: ExtendedRecipe[], userId: string) => {
  return recipes.map((recipe) => (
    {
      ...recipe,
      owner: {
        _id: recipe.owner._id,
        name: recipe.owner.name,
        image: recipe.owner.image
      },
      likedBy: recipe.likedBy.map(({ _id, name, image }) => ({ _id, name, image })), // Simplifies likedBy list
      owns: recipe.owner._id.toString() === userId, // Flags if the recipe belongs to the user
      liked: recipe.likedBy.some(l => l._id.toString() === userId) // Flags if the user liked the recipe
    }
  ))
}

// Updates the recipe list by either replacing or removing a recipe from the list
export const updateRecipeList = (oldList: ExtendedRecipe[], newRecipe: ExtendedRecipe | null, deleteId?: string) => {
  const indexOfUpdate = oldList.findIndex((p) => p._id === (newRecipe ? newRecipe._id : deleteId));
  return newRecipe ? [
    ...oldList.slice(0, indexOfUpdate), // Preserves recipes before the updated one
    newRecipe, // Inserts the updated recipe
    ...oldList.slice(indexOfUpdate + 1), // Preserves recipes after the updated one
  ] : [
    ...oldList.slice(0, indexOfUpdate), // Preserves recipes before the deleted one
    ...oldList.slice(indexOfUpdate + 1), // Removes the deleted recipe
  ];
};

// Filters recipes based on search criteria in name, ingredients, or dietary preferences
export const getFilteredRecipes = (recipes: ExtendedRecipe[], search: string | null) => {
  if (!search) return recipes;
  const filteredRecipes = recipes.filter(({ name, ingredients, dietaryPreference }) => {
    const isFoundInName = name.toLowerCase().includes(search); // Matches search with recipe name
    const isFoundInIngredients = ingredients.filter(ingredient => ingredient.name.toLowerCase().includes(search)); // Matches search with ingredients
    const isFoundInDiets = dietaryPreference.filter(diet => diet.toLowerCase().includes(search)); // Matches search with dietary preferences
    return isFoundInName || Boolean(isFoundInIngredients.length) || Boolean(isFoundInDiets.length);
  });
  return filteredRecipes;
};

// Utility to fetch data on server-side while ensuring user authentication
export const getServerSidePropsUtility = async (context: GetServerSidePropsContext, address: string, propskey: string = 'recipes') => {
  try {
    const session = await getSession(context);
    if (!session) {
      return {
        redirect: {
          destination: '/',
          permanent: false,
        },
      };
    }
    const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_BASE_URL}/${address}`, {
      headers: {
        Cookie: context.req.headers.cookie || '',
      },
    });
    return {
      props: {
        [propskey]: data,
      },
    };
  } catch (error) {
    console.error(`Failed to fetch ${propskey}:`, error); // Logs errors in fetching data
    return {
      props: {
        [propskey]: [], // Returns an empty list if there's an error
      },
    };
  }
};

// REST API call utility supporting multiple HTTP methods
interface methods {
  put: 'put';
  post: 'post';
  delete: 'delete';
  get: 'get';
}

interface RESTcallTypes {
  address: string;
  method?: keyof methods;
  payload?: {
    [key: string]: any;
  };
}

export const call_api = async ({ address, method = 'get', payload }: RESTcallTypes) => {
  try {
    const { data } = await axios[method as keyof methods](address, payload);
    return data; // Returns the data from the API call
  } catch (error) {
    console.error(`An error occurred making a ${method} REST call to -> ${address} error -> ${error}`);
    throw (error); // Rethrows the error for further handling
  }
};
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { ReactElement, ComponentType } from 'react';
import Loading from './Loading';

/* 
This component is not currently being used as authentication is verified by layout component
But if needed, can wrap a component in this HOC to validate authentication 
*/
const withAuth = <P extends object>(Component: ComponentType<P>): ComponentType<P> => {
  const Auth = (props: P): ReactElement | null => {
    const { data: session, status } = useSession();
    const router = useRouter();

    if (status === 'loading') {
      return <Loading />;
    }

    if (!session) {
      router.push('/');
      return null;
    }

    return <Component {...props} />;
  };

  Auth.displayName = `WithAuth(${Component.displayName || Component.name || 'Component'})`;

  return Auth;
};

export default withAuth;

import { useState } from 'react';
import FrontDisplay from './FrontDisplay'
import Dialog from './Dialog'
import { call_api } from '../../utils/utils';
import { ExtendedRecipe } from '../../types';

interface ViewRecipesProps {
    recipes: ExtendedRecipe[],
    handleRecipeListUpdate: (r: ExtendedRecipe | null, deleteId?: string) => void
}
const initialDialogContents: ExtendedRecipe | null = null

function ViewRecipes({ recipes, handleRecipeListUpdate }: ViewRecipesProps) {
    const [openDialog, setOpenDialog] = useState(initialDialogContents);
    const [deleteId, setDeleteId] = useState('')

    const handleShowRecipe = (recipe: ExtendedRecipe) => {
        setOpenDialog(recipe)
    }
    const handleDeleteRecipe = async () => {
        if (!openDialog) return;
        try {
            setOpenDialog(null)
            setDeleteId(openDialog._id)
            const response = await call_api({
                address: '/api/delete-recipe',
                method: 'delete',
                payload: { data: { recipeId: openDialog._id } }
            })
            const { message, error } = response;
            if (error) {
                throw new Error(error)
            }
            if (message) {
                handleRecipeListUpdate(null, openDialog._id)
            }
        } catch (error) {
            console.error(error)
            setDeleteId('')
        }
    }

    if (!recipes.length) return null;
    return (
        <>
            <div className="flex justify-center items-center min-h-screen p-5 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {recipes.map((recipe) => (
                        <FrontDisplay
                            key={recipe._id}
                            recipe={recipe}
                            showRecipe={handleShowRecipe}
                            updateRecipeList={handleRecipeListUpdate}
                            isLoading={deleteId === recipe._id} />
                    ))}
                </div>
            </div>
            <Dialog
                isOpen={Boolean(openDialog)}
                close={() => setOpenDialog(null)}
                recipe={openDialog}
                deleteRecipe={handleDeleteRecipe}
            />
        </>
    )
}

export default ViewRecipes;import {
    Dialog, DialogPanel,
    DialogTitle, DialogBackdrop,
    Button
} from '@headlessui/react';

interface DeleteDialogProps {
    isOpen: boolean
    recipeName: string
    closeDialog: () => void
    deleteRecipe: ()=> void
}
function DeleteDialog({ isOpen, closeDialog, recipeName, deleteRecipe }: DeleteDialogProps) {
   return <Dialog open={isOpen} onClose={closeDialog} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/80" />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <DialogPanel className="max-w-lg space-y-4 border bg-white p-12 rounded-lg shadow-lg">
                <DialogTitle className="text-xl font-bold">{`Permanently delete ${recipeName} ?`}</DialogTitle>
                <div className="flex gap-4 flex-end">
                    <Button className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400" onClick={closeDialog}>Cancel</Button>
                    <Button
                        className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 data-[disabled]:bg-gray-200"
                        onClick={deleteRecipe}
                    >
                        Delete
                    </Button>
                </div>
            </DialogPanel>
        </div>
    </Dialog>
}

export default DeleteDialog;
import Image from "next/image"
import { Button } from '@headlessui/react'
import { call_api } from "../../utils/utils";
import { ExtendedRecipe } from '../../types';
import Loading from "../Loading";


interface FrontDisplayProps {
    recipe: ExtendedRecipe
    showRecipe: (recipe: ExtendedRecipe) => void
    updateRecipeList: (recipe: ExtendedRecipe) => void
    isLoading: boolean
}

const getThumbsup = ({ liked, owns }: { liked: boolean, owns: boolean }) => {
    if (owns) {
        return (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray" className="size-5">
            <path d="M7.493 18.5c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.125c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75A.75.75 0 0 1 15 2a2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777ZM2.331 10.727a11.969 11.969 0 0 0-.831 4.398 12 12 0 0 0 .52 3.507C2.28 19.482 3.105 20 3.994 20H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 0 1-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227Z" />
        </svg>)
    }
    if (liked) {
        return (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0070ff" className="size-5">
            <path d="M7.493 18.5c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.125c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75A.75.75 0 0 1 15 2a2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777ZM2.331 10.727a11.969 11.969 0 0 0-.831 4.398 12 12 0 0 0 .52 3.507C2.28 19.482 3.105 20 3.994 20H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 0 1-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227Z" />
        </svg>)
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#0070ff" className="size-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
        </svg>
    )
}


function FrontDisplay({ recipe, showRecipe, updateRecipeList, isLoading }: FrontDisplayProps) {

    const handleRecipeLike = async (recipeId: string) => {
        try {
            const result = await call_api({ address: '/api/like-recipe', method: 'put', payload: { recipeId } })
            updateRecipeList(result);
        } catch (error) {
            console.log(error)
        }
    }

    return (
        <div className="max-w-sm bg-gradient-to-r from-slate-200 to-stone-100 border border-gray-200 rounded-lg shadow-lg mt-4 mb-2 transform transition-transform hover:scale-105 hover:shadow-lg flex flex-col h-full">
            <div className="relative w-full h-64"> {/* Add a container for the image */}
                <Image
                    src={recipe.imgLink}
                    fill
                    alt={recipe.name}
                    style={{ objectFit: 'cover' }}
                    className="rounded-t-lg"
                    priority
                    sizes="auto"
                />
            </div>
            <div className="p-5 flex-grow">
                <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 drop-shadow-lg">{recipe.name}</h5>
                <p className="font-normal text-gray-700 dark:text-gray-400">{recipe.additionalInformation.nutritionalInformation}</p>
            </div>
            {
                isLoading ?
                    <div className="p-10">
                        <Loading />
                    </div>
                    :
                    <>
                        <div className="mx-auto flex">
                            {
                                recipe.dietaryPreference.map((preference) => (
                                    <span key={preference} className="chip bg-green-100 text-green-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded hover:scale-110">{preference}</span>
                                ))
                            }
                        </div>
                        <div className="p-5">
                            <div className="flex items-center justify-between">
                                <Button
                                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                                    onClick={() => showRecipe(recipe)}
                                >
                                    See Recipe
                                    <svg className="rtl:rotate-180 w-3.5 h-3.5 ms-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 5h12m0 0L9 1m4 4L9 9" />
                                    </svg>
                                </Button>
                                <Button
                                    className="py-1.5 px-3 hover:text-blue-600 hover:scale-105 hover:shadow text-center border border-gray-300 rounded-md border-gray-400 h-8 text-sm flex items-center gap-1 lg:gap-2"
                                    onClick={() => handleRecipeLike(recipe._id)}
                                    disabled={recipe.owns}
                                    data-testid="like_button"
                                >
                                    {getThumbsup(recipe)}
                                    <span>{recipe.likedBy.length}</span>
                                </Button>
                            </div>
                        </div>
                    </>
            }

        </div>

    )
}

export default FrontDisplay



import { useState } from 'react';
import { useRouter } from 'next/router';
import { DialogBackdrop, Dialog, DialogPanel, Button } from '@headlessui/react'
import Image from 'next/image'
import RecipeCard from '../Recipe_Creation/RecipeCard'
import DeleteDialog from './DeleteDialog';
import { ExtendedRecipe } from '../../types'

interface RecipeDialogProps {
    isOpen: boolean
    close: () => void
    recipe: ExtendedRecipe | null
    deleteRecipe: () => void
}

const formatDate = (date: string) => {
    const [, day, mth, year] = new Date(date).toUTCString().split(' ');
    return `${day} ${mth} ${year}`;
};

export default function RecipeDisplayModal({ isOpen, close, recipe, deleteRecipe }: RecipeDialogProps) {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false); // State to manage delete dialog visibility

    const router = useRouter();

    const handleClone = () => {
        router.push({
            pathname: '/CreateRecipe',
            query: {
                oldIngredients: recipe?.ingredients.map(i => i.name)
            }
        })
    }

    if (!recipe) return null
    return (
        <>
            <Dialog open={isOpen} as="div" className="relative z-50 focus:outline-none" onClose={close}>
                <DialogBackdrop className="fixed inset-0 bg-black/50" />
                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <DialogPanel
                            transition
                            className="w-full max-w-md rounded-xl bg-white p-1 backdrop-blur-2xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
                        >
                            <div className="flex flex-col items-center">
                                <div className="flex justify-between items-start w-full">
                                    <div className="flex items-center mb-2 mt-2 ml-2 bg-gray-100 p-2 rounded-lg">
                                        <Image
                                            className="h-10 w-10 rounded-full"
                                            src={recipe.owner.image || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"}
                                            alt={`Profile-Picture-${recipe.owner.name}`}
                                            width={25}
                                            height={25}
                                        />
                                        <div className="ml-4">
                                            <p className="text-lg font-semibold text-gray-900">{recipe.owner.name}</p>
                                            <p className="text-sm text-gray-500">{formatDate(recipe.createdAt)}</p>
                                        </div>
                                    </div>
                                    <Button className="mr-3 mt-2 bg-white rounded-md p-2 inline-flex items-center justify-center text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" onClick={close} data-testid="open_recipe_dialog">
                                        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </Button>
                                </div>
                                <div className="w-full h-11 flex justify-between items-center px-2">
                                    <Button
                                        className="px-3 py-2 text-sm font-medium text-center text-white bg-green-700 rounded-lg hover:bg-green-800 focus:ring-4 focus:outline-none focus:ring-green-300 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
                                        onClick={() => handleClone()}
                                    >
                                        Clone Ingredients
                                    </Button>
                                    {recipe.owns && <Button
                                        className="px-3 py-2 text-sm font-medium text-center text-white bg-red-700 rounded-lg hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800"
                                        onClick={() => setIsDeleteDialogOpen(true)}
                                    >
                                        Delete Recipe
                                    </Button>}
                                </div>
                                <RecipeCard
                                    recipe={recipe}
                                    selectedRecipes={[]}
                                    removeMargin
                                />
                            </div>

                        </DialogPanel>
                    </div>
                </div>
            </Dialog>
            <DeleteDialog
                isOpen={isDeleteDialogOpen}
                recipeName={recipe.name}
                closeDialog={() => (setIsDeleteDialogOpen(false))}
                deleteRecipe={() => {
                    setIsDeleteDialogOpen(false)
                    deleteRecipe()
                }}
            />
        </>
    )
}export default function Product({ resetPage }: { resetPage: () => void }) {
  return (
    <div className="flex flex-col justify-center items-center px-4 md:px-8 lg:px-12">
      <h1 className="mb-2 text-4xl font-semibold text-gray-900 dark:text-white text-center">Our Product</h1>
      <h2 className="mt-6 mb-5 text-2xl leading-8 text-gray-600 text-center max-w-2xl">
        Learn more about the amazing features of our product.
      </h2>
      <ul className="space-y-4 text-gray-500 list-inside dark:text-gray-400">
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          AI-powered recipe generation using your available ingredients.
        </li>
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          Customized recipes based on dietary preferences and restrictions.
        </li>
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          User-friendly interface to easily add ingredients and generate recipes.
        </li>
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          Option to save, rate, and share your favorite recipes.
        </li>
      </ul>
      <button
        className="mt-10 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onClick={resetPage}
      >
        Back to Home
      </button>
    </div>
  );
}
import React from 'react';

export default function Features({ resetPage }: { resetPage: () => void }) {
  return (
    <div className="flex flex-col justify-center items-center px-4 md:px-8 lg:px-12">
      <h1 className="mb-2 text-4xl font-semibold text-gray-900 dark:text-white text-center">Features</h1>
      <h2 className="mt-6 mb-5 text-2xl leading-8 text-gray-600 text-center max-w-2xl">
      Discover the features that make our product unique.
      </h2>
      <ul className="space-y-4 text-gray-500 list-inside dark:text-gray-400">
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          Ingredient-based recipe generation using advanced AI algorithms.
        </li>
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          Support for various dietary preferences like vegan, gluten-free, and more.
        </li>
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          Easy-to-use interface for adding ingredients and generating recipes.
        </li>
        <li className="flex items-center text-lg">
          <svg className="w-3.5 h-3.5 me-2 text-green-500 dark:text-green-400 flex-shrink-0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z" />
          </svg>
          Save, rate, and share your favorite recipes with others.
        </li>
      </ul>
      <button
        className="mt-10 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        onClick={resetPage}
      >
        Back to Home
      </button>
    </div>
  );
}
import { signIn } from 'next-auth/react';
export default function Landing() {
    return (
        <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Generate Delicious Recipes with Your Ingredients
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
                Simply input your available ingredients, select dietary preferences, and let our AI create unique and delicious recipes just for you.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
                <button
                    className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    onClick={() => signIn('google')}
                >
                    Get started
                </button>
            </div>
        </div>
    );
}import { useState, useEffect } from 'react';

const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {isVisible && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 bg-green-500 bg-opacity-85 text-white w-12 h-12 rounded-full shadow-lg text-xl flex items-center justify-center"
        >
          ↑
        </button>
      )}
    </div>
  );
};

export default ScrollToTopButton;
import IngredientForm from './IngredientForm';
import DietaryPreferences from './DietaryPreferences';
import ReviewComponent from './ReviewIngredients';
import SelectRecipesComponent from './SelectRecipes';
import ReviewRecipesComponent from './ReviewRecipes';
import { Ingredient, DietaryPreference, Recipe, IngredientDocumentType } from '../../types/index'



interface StepComponentProps {
    step: number,
    ingredientList: IngredientDocumentType[]
    ingredients: Ingredient[],
    updateIngredients: (ingredients: Ingredient[]) => void
    preferences: DietaryPreference[]
    updatePreferences: (preferences: DietaryPreference[]) => void
    editInputs: () => void
    handleIngredientSubmit: () => void
    generatedRecipes: Recipe[]
    updateSelectedRecipes: (ids: string[]) => void
    selectedRecipes: string[]
    handleRecipeSubmit: (recipes: Recipe[]) => void
}

function StepComponent({
    step,
    ingredientList,
    ingredients,
    updateIngredients,
    preferences,
    updatePreferences,
    editInputs,
    handleIngredientSubmit,
    generatedRecipes,
    selectedRecipes,
    updateSelectedRecipes,
    handleRecipeSubmit
}: StepComponentProps) {
    switch (step) {
        case 0:
            return (
                <IngredientForm
                    ingredientList={ingredientList}
                    ingredients={ingredients}
                    updateIngredients={updateIngredients}
                    generatedRecipes={generatedRecipes}
                />
            );
        case 1:
            return (
                <DietaryPreferences
                    preferences={preferences}
                    updatePreferences={updatePreferences}
                    generatedRecipes={generatedRecipes}
                />
            )
        case 2:
            return (
                <ReviewComponent
                    ingredients={ingredients}
                    dietaryPreference={preferences}
                    onEdit={editInputs}
                    onSubmit={handleIngredientSubmit}
                    generatedRecipes={generatedRecipes}
                />
            )
        case 3:
            return (
                <SelectRecipesComponent
                    generatedRecipes={generatedRecipes}
                    selectedRecipes={selectedRecipes}
                    updateSelectedRecipes={updateSelectedRecipes}
                />
            )
        case 4:
            return (
                <ReviewRecipesComponent
                    generatedRecipes={generatedRecipes}
                    selectedRecipes={selectedRecipes}
                    handleRecipeSubmit={handleRecipeSubmit}
                />
            )
        default:
            return <h1 className="text-center">Not ready yet!</h1>;
    }

}

export default StepComponent;import { Switch } from '@headlessui/react'
import { Recipe } from '../../types/index'

interface RecipeCardProps {
    recipe: Recipe
    handleRecipeSelection?: (id: string) => void
    selectedRecipes: string[]
    showSwitch?: boolean
    removeMargin?: boolean
}

const RecipeCard = ({ recipe, handleRecipeSelection, selectedRecipes, showSwitch, removeMargin }: RecipeCardProps) => {
    const parentClassName = `max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden ${removeMargin ? '' : 'mt-10 mb-5'}` 
    return (
        <div className={parentClassName} key={recipe.name}>
            <div className="px-6 py-4">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-2xl mb-4">{recipe.name}</div>
                    {
                        showSwitch && <Switch
                            checked={selectedRecipes.includes(recipe.openaiPromptId)}
                            onChange={() => handleRecipeSelection ? handleRecipeSelection(recipe.openaiPromptId) : undefined}
                            className={`${selectedRecipes.includes(recipe.openaiPromptId) ? 'bg-green-500' : 'bg-gray-300'}
          relative inline-flex h-[28px] w-[54px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75`}
                        >
                            <span className="sr-only">Use setting</span>
                            <span
                                aria-hidden="true"
                                className={`${selectedRecipes.includes(recipe.openaiPromptId) ? 'translate-x-7' : 'translate-x-0'}
            pointer-events-none inline-block h-[24px] w-[23px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
                            />
                        </Switch>
                    }
                </div>
                <h3 className="text-gray-700 font-semibold text-lg">Ingredients:</h3>
                <ul className="mb-4 flex flex-wrap gap-2">
                    {recipe.ingredients.map((ingredient) => (
                        <li key={ingredient.name} className="flex justify-between gap-x-2">
                            <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
                                {`${ingredient.name}${ingredient.quantity ? ` (${ingredient.quantity})` : ''}`}
                            </span>
                        </li>
                    ))}
                </ul>

                <h3 className="text-gray-700 font-semibold text-lg">Dietary Preference:</h3>
                <div className="mb-5 mt-2 flex flex-wrap gap-2">
                    {recipe.dietaryPreference.map((preference) => (
                        <span key={preference} className="bg-purple-100 text-purple-800 text-sm font-medium px-2.5 py-0.5 rounded">
                            {preference}
                        </span>
                    ))}
                </div>

                <h3 className="text-gray-700 font-semibold text-lg">Instructions:</h3>
                <ol className="mb-5 mt-2 space-y-2 bg-gray-50 border border-gray-200 p-4 rounded-lg">
                    {recipe.instructions.map((instruction, idx) => (
                        <li className="text-gray-800 text-sm font-medium" key={instruction}>
                            {`${idx + 1}. ${instruction}`}
                        </li>
                    ))}
                </ol>

                <h3 className="text-gray-700 font-semibold text-lg">Additional Information:</h3>
                <div className="mb-5 mt-2 space-y-2">
                    <div className="text-gray-800 text-sm font-medium">
                        <strong>Tips:</strong> {recipe.additionalInformation.tips}
                    </div>
                    <div className="text-gray-800 text-sm font-medium">
                        <strong>Variations:</strong> {recipe.additionalInformation.variations}
                    </div>
                    <div className="text-gray-800 text-sm font-medium">
                        <strong>Serving Suggestions:</strong> {recipe.additionalInformation.servingSuggestions}
                    </div>
                    <div className="text-gray-800 text-sm font-medium">
                        <strong>Nutritional Information:</strong> {recipe.additionalInformation.nutritionalInformation}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default RecipeCard;import React from 'react';
import { Button } from '@headlessui/react';
import { useRouter } from 'next/router';

interface LimitReachedProps {
    message?: string;
    onAction?: () => void;
    actionText?: string;
}

const LimitReached: React.FC<LimitReachedProps> = ({
    message = "You've reached your recipe creation limit.",
    onAction,
    actionText = "Go to Home",
}) => {
    const router = useRouter();

    const handleAction = () => {
        if (onAction) {
            onAction();
        } else {
            router.push('/');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
                {/* Icon */}
                <svg
                    className="w-16 h-16 text-red-500 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                {/* Title */}
                <h2 className="text-2xl font-bold mb-2 text-gray-800">Limit Reached</h2>
                {/* Message */}
                <p className="text-gray-600 mb-6">{message}</p>
                {/* Action Button */}
                <Button
                    onClick={handleAction}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                    {actionText}
                </Button>
            </div>
        </div>
    );
};

export default LimitReached;
import React, { useEffect, useState } from 'react';
import RecipeCard from './RecipeCard';
import { Button } from '@headlessui/react';
import { Recipe } from '../../types/index'

interface ReviewRecipesComponentProps {
    generatedRecipes: Recipe[]
    selectedRecipes: string[]
    handleRecipeSubmit: (recipes: Recipe[]) => void
}

const initialRecipes: Recipe[] = [];

const ReviewRecipesComponent = ({ generatedRecipes, selectedRecipes, handleRecipeSubmit }: ReviewRecipesComponentProps) => {
    const [finalRecipes, setFinalRecipes] = useState(initialRecipes)

    useEffect(() => {
        const recipes = generatedRecipes.filter((recipe) => selectedRecipes.includes(recipe.openaiPromptId))
        setFinalRecipes(recipes)
    }, [generatedRecipes, selectedRecipes])

    return (
        <div className="flex flex-col">

            <div className="flex flex-wrap">
                {
                    finalRecipes.map((recipe) => (
                        <RecipeCard
                            recipe={recipe}
                            key={recipe.openaiPromptId}
                            selectedRecipes={selectedRecipes}
                        />
                    ))
                }
            </div>
            <div className="flex w-[300px] max-w-md mx-auto justify-center mb-3">
                {
                    finalRecipes.length ?
                        <Button 
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                        onClick={()=> handleRecipeSubmit(finalRecipes)}
                        >
                            Submit Selected Recipes
                        </Button>
                        :
                        <div className="mt-4 text-red-500 font-bold">
                            No recipes selected for submission. Please select at least one recipe. If you navigate away, all recipes will be discarded.
                        </div>
                }

            </div>
        </div>
    );
};

export default ReviewRecipesComponent;
import React from 'react';
import RecipeCard from './RecipeCard';
import { Recipe } from '../../types/index'
import { Button } from '@headlessui/react';

interface SelectRecipesComponentProps {
    generatedRecipes: Recipe[]
    updateSelectedRecipes: (ids: string[]) => void
    selectedRecipes: string[]
}

const SelectRecipesComponent = ({ generatedRecipes, selectedRecipes, updateSelectedRecipes }: SelectRecipesComponentProps) => {

    const handleRecipeSelection = (recipeId: string) => {
        const updatedSelections = selectedRecipes.includes(recipeId) ? selectedRecipes.filter((p) => p !== recipeId) : [...selectedRecipes, recipeId]
        updateSelectedRecipes(updatedSelections)
    }

    const handleSelectAll = () => {
        const allIds = generatedRecipes.map(recipe => recipe.openaiPromptId);
        updateSelectedRecipes(allIds)
    }

    return (
        <div className="flex flex-col">
            <div className="flex w-[300px] max-w-md mx-auto justify-center">
                <Button className="bg-white text-black px-4 py-2 rounded-md hover:underline hover:text-blue-500" onClick={handleSelectAll}>
                    Select All
                </Button>
                <Button className="bg-white text-black px-4 py-2 rounded-md hover:underline hover:text-blue-500" onClick={() => updateSelectedRecipes([])}>
                    Unselect All
                </Button>
            </div>
            <div className="flex flex-wrap">
                {
                    generatedRecipes.map((recipe) => (
                        <RecipeCard
                            recipe={recipe}
                            key={recipe.openaiPromptId}
                            handleRecipeSelection={handleRecipeSelection}
                            selectedRecipes={selectedRecipes}
                            showSwitch
                        />
                    ))
                }
            </div>
        </div>
    );
};

export default SelectRecipesComponent;
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import NewIngredientDialog from './NewIngredientDialog';
import { Ingredient, Recipe, IngredientDocumentType } from '../../types/index'


type comboIngredient = { id: number, name: string }

const initialComboIngredient: comboIngredient = { id: 0, name: '' }

const Chip = ({ ingredient, onDelete }: { ingredient: Ingredient, onDelete: (id: string) => void }) => {
    return (
        <div className="flex">
            <span className="flex items-center bg-blue-600 text-white text-sm font-medium me-2 px-2.5 py-0.5 rounded m-2">{`${ingredient.name}${ingredient.quantity ? ` (${ingredient.quantity})` : ''}`}
                <div onClick={() => onDelete(ingredient.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="feather feather-x cursor-pointer hover:text-gray-300 rounded-full w-4 h-4 ml-2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </div>
            </span>
        </div>
    )
}

interface IngredientListProps {
    ingredientList: IngredientDocumentType[]
    ingredientUpdate: (val: string | undefined) => void,
    generatedRecipes: Recipe[]
}

function IngredientList({ ingredientList, ingredientUpdate, generatedRecipes }: IngredientListProps) {
    const [selectedIngredient, setSelectedIngredient] = useState(initialComboIngredient)
    const [query, setQuery] = useState('')

    const filteredIngredients: IngredientDocumentType[] =
        query === ''
            ? ingredientList
            : ingredientList.filter((ingredient) => {
                return ingredient.name.toLowerCase().includes(query.toLowerCase())
            })

    const handleSelectedIngredient = (ingredient: comboIngredient) => {
        setSelectedIngredient(initialComboIngredient);
        ingredientUpdate(ingredient?.name)
    }
    return (
        <div className="mx-auto w-full pt-6">
            <Combobox
                value={selectedIngredient}
                onChange={handleSelectedIngredient}
                onClose={() => setQuery('')}
                immediate
                disabled={Boolean(generatedRecipes.length)}
            >
                <div className="relative">
                    <ComboboxInput
                        className={clsx(
                            'w-full rounded-lg border border-gray/20 bg-white py-2 pr-8 pl-3 text-base text-gray-900',
                            'focus:outline-none focus:ring-2 focus:ring-indigo-600'
                        )}
                        displayValue={(ingredient: comboIngredient) => ingredient?.name}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder='Choose Ingredient'
                    />
                    <ComboboxButton className="group absolute inset-y-0 right-0 px-2.5">
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    </ComboboxButton>
                </div>

                <ComboboxOptions
                    anchor="bottom"
                    transition
                    className={clsx(
                        'w-[var(--input-width)] rounded-xl border border-gray bg-white/100 p-1 [--anchor-gap:var(--spacing-1)] empty:invisible',
                        'transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0'
                    )}
                >
                    {filteredIngredients.map((ingredient) => (
                        <ComboboxOption
                            key={ingredient._id}
                            value={ingredient}
                            className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-black/10"
                        >
                            <CheckIcon className="invisible size-4 fill-black group-data-[selected]:visible" />
                            <div className="text-sm/6 text-gray-900">{ingredient.name}</div>
                        </ComboboxOption>
                    ))}
                </ComboboxOptions>
            </Combobox>
        </div>
    )
}

interface IngredientFormProps {
    ingredientList: IngredientDocumentType[],
    ingredients: Ingredient[],
    updateIngredients: (ingredients: Ingredient[]) => void
    generatedRecipes: Recipe[]
}

export default function IngredientForm({
    ingredientList: originalIngredientList,
    ingredients,
    updateIngredients,
    generatedRecipes
}: IngredientFormProps) {
    const [ingredientList, setIngredientList] = useState(originalIngredientList)

    const handleChange = (val: string | undefined) => {
        if (!val) return;
        const isRepeat = ingredients.some(i => i.name === val);
        if (isRepeat) return
        updateIngredients([
            ...ingredients,
            { name: val, id: uuidv4() }
        ])
    }

    const deleteIngredient = (id: string) => {
        if (Boolean(generatedRecipes.length)) return null;
        updateIngredients(ingredients.filter(ingredient => ingredient.id !== id))
    }

    return (
        <>
            <div className="flex min-h-full flex-1 flex-col justify-center items-center px-6 py-3 lg:px-8">
                <NewIngredientDialog
                    ingredientList={ingredientList}
                    updateIngredientList={(newIngredient) => setIngredientList([...ingredientList, newIngredient])}
                />
                <div className="mt-0 sm:mx-auto sm:w-full sm:max-w-sm">
                    <form className="space-y-6" action="#" method="POST">
                        <IngredientList
                            ingredientList={ingredientList}
                            ingredientUpdate={(val) => handleChange(val)}
                            generatedRecipes={generatedRecipes}
                        />
                    </form>
                    {ingredients.length ? <div className="mt-3 text-gray-600 font-bold text-center">
                        <span>Selected Ingredients:</span>
                    </div> : null}
                    <div className="flex flex-wrap justify-center mt-2">
                        {
                            ingredients.map(((ingredient: Ingredient) =>
                                <Chip
                                    ingredient={ingredient}
                                    key={ingredient.id}
                                    onDelete={(id: string) => deleteIngredient(id)}
                                />
                            ))
                        }
                    </div>

                </div>
            </div>
        </>
    )
}
import React from 'react';
import { Button } from '@headlessui/react'
import { Ingredient, DietaryPreference, Recipe } from '../../types/index'

interface ReviewComponentProps {
    ingredients: Ingredient[]
    dietaryPreference: DietaryPreference[]
    onSubmit: () => void
    onEdit: () => void
    generatedRecipes: Recipe[]
}

const ReviewComponent = ({ ingredients, dietaryPreference, onSubmit, onEdit, generatedRecipes }: ReviewComponentProps) => {
    return (
        <div className="max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden mt-10">
            <div className="px-6 py-4">
                <div className="font-bold text-xl mb-2">Review Your Selections</div>
                {ingredients.length < 3 ? <p className="text-sm text-red-300">Please select at least 3 ingredients to proceed with recipe creation.</p> : null}
                <h3 className="text-gray-700 font-semibold text-lg">Ingredients:</h3>
                <div className="mb-4 flex flex-wrap">
                    {ingredients.map((ingredient) => (
                        <li key={ingredient.name} className="flex justify-between gap-x-6 py-2">
                            <div className="flex min-w-0 gap-x-4">
                                <div className="min-w-0 flex-auto">
                                    <span className="bg-green-100 text-green-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">{`${ingredient.name}${ingredient.quantity ? ` (${ingredient.quantity})` : ''}`}</span>
                                </div>
                            </div>
                        </li>
                    ))}
                </div>
                <h3 className="text-gray-700 font-semibold text-lg">Dietary Preference:{dietaryPreference.length ? '' : ' None'}</h3>
                <div className="mb-5 mt-2 flex flex-wrap">
                    {
                        dietaryPreference.map((preference) => (
                            <span key={preference} className="bg-purple-100 text-purple-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded dark:bg-purple-900 dark:text-purple-300">{preference}</span>
                        ))
                    }
                </div>
                <div className="flex justify-between mt-4">
                    <Button
                        onClick={onEdit}
                        className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-500 data-[disabled]:bg-gray-200"
                        disabled={Boolean(generatedRecipes.length)}
                    >
                        Edit
                    </Button>
                    <Button
                        onClick={onSubmit}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-sky-500 data-[disabled]:bg-gray-200"
                        disabled={ingredients.length < 3 || Boolean(generatedRecipes.length)}
                    >
                        Create Recipes
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ReviewComponent;
import React, { useEffect, useState } from 'react';
import {
  Description, Dialog, DialogPanel,
  DialogTitle, DialogBackdrop,
  Button, Input, Field, Label
} from '@headlessui/react';
import pluralize from 'pluralize';
import clsx from 'clsx';
import { call_api } from '../../utils/utils';
import Loading from '../Loading';
import { IngredientDocumentType } from '../../types/index';

interface NewIngredientDialogProps {
  ingredientList: IngredientDocumentType[],
  updateIngredientList: (newIngredient: IngredientDocumentType) => void
}

function NewIngredientDialog({ ingredientList, updateIngredientList }: NewIngredientDialogProps) {
  const [isOpen, setIsOpen] = useState(false); // State to manage dialog visibility
  const [ingredientName, setIngredientName] = useState(''); // State to manage the ingredient name input
  const [isLoading, setIsLoading] = useState(false); // State to manage the loading state
  const [message, setMessage] = useState(''); // State to manage feedback messages
  const [isDisabled, setIsDisabled] = useState(false); // State to manage the disabled state of the submit button

  useEffect(() => {
    setIngredientName('');
    setMessage('');
  }, [isOpen]); // Reset ingredient name and message when dialog is opened/closed

  // Handle input change for the ingredient name
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIngredientName(e.target.value);
    setMessage('');
    setIsDisabled(false);
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!ingredientName.trim()) return;
    if (ingredientName.trim().length > 20) {
      setMessage('This ingredient name is too long!');
      setIsDisabled(true);
      return;
    }

    const ingredient = ingredientName.trim().toLowerCase();
    const availableIngredients = ingredientList.map(i => i.name.toLowerCase());
    const pluralizedIngredient = pluralize(ingredient);
    const singularizedIngredient = pluralize.singular(ingredient);
    const isAvailable = availableIngredients.includes(ingredient) ||
      availableIngredients.includes(pluralizedIngredient) ||
      availableIngredients.includes(singularizedIngredient);

    if (isAvailable) {
      setMessage('This ingredient is already available');
      setIsDisabled(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await call_api({ address: '/api/validate-ingredient', method: 'post', payload: { ingredientName } });
      const { message: responseMessage, error } = response;

      if (error) {
        throw new Error(error)
      }

      if (responseMessage === 'Success') {
        setMessage(`Successfully added: ${response.newIngredient.name}`);
        updateIngredientList(response.newIngredient);
        setIngredientName('');
      } else if (responseMessage === 'Invalid') {
        const possibleSuggestions = response.suggested.join(', ');
        setMessage(`${ingredientName} is invalid. ${possibleSuggestions ? `Try the following suggestions: ${possibleSuggestions}` : ''}`);
        setIngredientName('');
      } else {
        setMessage(`An error occurred with validation... check back later: ${responseMessage}`);
        setIngredientName('');
      }
    } catch (error) {
      console.error(error);
      setMessage('Failed to add ingredient');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 mr-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add New Ingredient
      </Button>
      <Dialog open={isOpen} onClose={() => { }} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/50" />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="max-w-lg space-y-4 border bg-white p-12 rounded-lg shadow-lg">
            <DialogTitle className="text-xl font-bold">Add New Ingredient</DialogTitle>
            <Description className="text-sm text-gray-500">If you can&apos;t find your ingredient in the list, enter its name here. We&apos;ll validate it before adding to the database.</Description>
            <Field className="mb-4">
              <Label htmlFor="ingredientName" className="block text-sm font-medium text-gray-700">Ingredient Name</Label>
              <Input
                type="text"
                id="ingredientName"
                name="ingredientName"
                className={clsx(
                  'mt-3 block w-full rounded-lg border-none bg-black/5 py-1.5 px-3 text-sm/6 text-black',
                  'focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25'
                )}
                value={ingredientName}
                onChange={handleInputChange}
              />
            </Field>
            <div className="text-red-400 font-bold h-[30px] mb-2">
              <span>{message}</span>
            </div>
            {isLoading ? <Loading /> :
              <div className="flex gap-4 flex-end">
                <Button className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 data-[disabled]:bg-gray-200"
                  onClick={handleSubmit}
                  disabled={!ingredientName.trim() || isDisabled}
                >
                  Submit
                </Button>
              </div>}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}

export default NewIngredientDialog;
import { useState, useEffect } from 'react';
import { Checkbox, Field, Label } from '@headlessui/react'
import { CheckIcon } from '@heroicons/react/16/solid'
import { DietaryPreference, Recipe } from '../../types/index'


const dietaryOptions: DietaryPreference[] = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Keto', 'Paleo'];

interface DietaryPreferencesProps {
  preferences: DietaryPreference[]
  updatePreferences: (preferences: DietaryPreference[]) => void
  generatedRecipes: Recipe[]
}

const initialPreference: DietaryPreference[] = [];

export default function DietaryPreferences({ preferences, updatePreferences, generatedRecipes }: DietaryPreferencesProps) {
  const [noPreference, setNoPreference] = useState(false)

  useEffect(() => {
    if (!preferences.length) {
      setNoPreference(true)
    }
  }, [preferences.length])

  const handlePreferenceChange = (checked: boolean, option: DietaryPreference) => {
    const updatedPreferences = preferences.includes(option) ? preferences.filter((p) => p !== option) : [...preferences, option]
    updatePreferences(updatedPreferences)
  };

  const handleNoPreference = () => {
    setNoPreference(!noPreference)
    updatePreferences([])
  }

  return (
    <div className="mt-2 ml-5 sm:mx-auto sm:w-full sm:max-w-sm">
      <h2 className="text-xl font-bold mb-4">Dietary Preferences</h2>
      <Field className="flex items-center gap-2 mr-5 mb-5 italic" disabled={Boolean(generatedRecipes.length)}>
        <Checkbox
          checked={noPreference}
          onChange={handleNoPreference}
          className="group size-6 rounded-md bg-black/10 p-1 ring-1 ring-black/15 ring-inset data-[checked]:bg-black"
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        <Label className="data-[disabled]:opacity-50">No Preference</Label>
      </Field>
      <hr className="mb-4" />
      <div className="flex flex-wrap">
        {dietaryOptions.map((option) => (
          <Field className="flex items-center gap-2 mr-5 mb-5 data-[disabled]:opacity-50" key={option} disabled={noPreference || Boolean(generatedRecipes.length)}>
            <Checkbox
              checked={preferences.includes(option)}
              onChange={(e) => handlePreferenceChange(e, option)}
              className="group size-6 rounded-md bg-black/10 p-1 ring-1 ring-black/15 ring-inset data-[checked]:bg-black"
            >
              <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
            </Checkbox>
            <Label>{option}</Label>
          </Field>
        ))}
      </div>
    </div>
  );
}import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Header from './Header';
import Hero from '../pages/Hero';
import Loading from './Loading'
import ErrorPage from '../pages/auth/error';

/* Note all components will be wrapped in this component which in turn is rendered by _app.tsx */
const Layout = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { error: signinError } = router.query;

  if (signinError) {
    return <ErrorPage />
  }

  if (router.pathname === '/_error') {
    return <ErrorPage message="Page not found"/>
  }

  if (status === 'loading') {
    return <Loading />;
  }

  if (!session) {
    return <Hero />
  }

  return (
    <div>
      <Header user={session.user} />
      <main className="min-h-screen bg-green-50">{children}</main>
    </div>
  );
};

export default Layout;

import { useSession } from 'next-auth/react';
import Image from 'next/image'
import { ExtendedRecipe } from '../../types';
import { Button } from '@headlessui/react';

interface ProfileInformationProps {
    recipes: ExtendedRecipe[]
    updateSelection: (s: string) => void
    selectedDisplay: string
}
function ProfileInformation({ recipes, updateSelection, selectedDisplay }: ProfileInformationProps) {
    const { data: session } = useSession();

    if (!session || !session.user) return null;

    const { user } = session;

    const ownedRecipes = recipes.filter(r => r.owns)
    const favoriteRecipes = recipes.filter(r => r.liked)
    const votesReceived = ownedRecipes.reduce((total, recipe) => (total + recipe.likedBy.length), 0)

    return (
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 mt-5">
            <div className="flex justify-end ">
            </div>
            <div className="flex flex-col items-center pb-10 px-4 pt-4">
                <Image
                    src={user?.image || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                    width={75}
                    height={75}
                    className="w-24 h-24 mb-3 rounded-full shadow-lg"
                    alt={`profile-${user.name}`}
                />
                <h5 className="mb-1 text-xl font-medium text-gray-900 dark:text-white">{user.name}</h5>
                <span className="text-sm text-gray-500 dark:text-gray-400">{user.email}</span>
                <div className="grid grid-cols-3 gap-4 text-center mt-2">
                    <div>
                        <div className="text-lg font-medium text-black">{ownedRecipes.length}</div>
                        <Button
                            onClick={() => updateSelection('created')}
                            className={`bg-white rounded-md ${selectedDisplay === 'created' ? 'text-rose-700 font-bold' : 'text-black hover:text-blue-500 hover:underline'}`}
                        >
                            Recipes Created
                        </Button>
                    </div>
                    <div>
                        <div className="text-lg font-medium text-black">{votesReceived}</div>
                        <Button
                            onClick={() => updateSelection('votes received')}
                            className={`bg-white rounded-md ${selectedDisplay === 'votes received' ? 'text-rose-700 font-bold' : 'text-black hover:text-blue-500 hover:underline'}`}
                        >
                            Votes Received
                        </Button>
                    </div>
                    <div>
                        <div className="text-lg font-medium text-black">{favoriteRecipes.length}</div>
                        <Button
                            onClick={() => updateSelection('favorites')}
                            className={`bg-white rounded-md ${selectedDisplay === 'favorites' ? 'text-rose-700 font-bold' : 'text-black hover:text-blue-500 hover:underline'}`}
                        >
                            Favorites
                        </Button>
                    </div>
                </div>
            </div>
        </div>

    )
}

export default ProfileInformation;import { useRouter } from 'next/router';
import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Bars3Icon, BellIcon, XMarkIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'
import { signOut } from 'next-auth/react';

const userNavigation = [
    { name: 'Your Profile', route: '/Profile' },
    { name: 'Sign out', route: '/auth/signout' },
]

const navigation = [
    { name: 'Home', route: '/Home' },
    { name: 'Create Recipes', route: '/CreateRecipe' },
    { name: 'About', route: '/' },
]

function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
}

interface HeaderProps {
    user: {
        name?: string | null | undefined
        image?: string | null | undefined
        email?: string | null | undefined
    } | undefined
}

function Header({ user }: HeaderProps) {

    const router = useRouter();

    const handleNavigation = (menu: { name: string, route: string }) => {
        if (menu.name === 'Sign out') {
            signOut()
            return
        }
        if (menu.name === 'About') {
            window.open('https://github.com/ml3m', '_blank');
        }
        router.push(menu.route)
    }

    if (!user) return null;
    return (
        <Disclosure as="nav" className="sticky top-0 z-50 bg-green-800 shadow-md">
            {({ open }) => (
                <>
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="flex h-16 items-center justify-between">
                            <div className="flex items-center">
                                <div className="flex-shrink-0 bg-white">
                                    <Image
                                        src="/favicon.ico"
                                        alt="logo"
                                        width={62}
                                        height={62}
                                        priority
                                    />
                                </div>
                                <div className="hidden md:block">
                                    <div className="ml-10 flex items-baseline space-x-4">
                                        {navigation.map((item) => (
                                            <button
                                                key={item.name}
                                                className={classNames(
                                                    item.route === router.pathname
                                                        ? 'bg-green-50 text-gray-800'
                                                        : 'text-gray-300 hover:bg-green-700 hover:text-white',
                                                    'rounded-md px-3 py-2 text-sm font-medium',
                                                )}
                                                aria-current={item.route === router.pathname ? 'page' : undefined}
                                                onClick={() => handleNavigation(item)}
                                            >
                                                {item.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="hidden md:block">
                                <div className="ml-4 flex items-center md:ml-6">
                                    <button
                                        type="button"
                                        className="relative rounded-full bg-green-800 p-1 text-gray-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-green-800"
                                    >
                                        <span className="absolute -inset-1.5" />
                                        <span className="sr-only">View notifications</span>
                                        <BellIcon className="h-6 w-6" aria-hidden="true" />
                                    </button>

                                    {/* Profile dropdown */}
                                    <Menu as="div" className="relative ml-3">
                                        <div>
                                            <MenuButton className="relative flex max-w-xs items-center rounded-full bg-green-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-green-800">
                                                <span className="absolute -inset-1.5" />
                                                <span className="sr-only">Open user menu</span>
                                                <Image
                                                    src={user?.image || ''}
                                                    alt=""
                                                    width={75}
                                                    height={75}
                                                    className="h-8 w-8 rounded-full"
                                                />
                                            </MenuButton>
                                        </div>
                                        <MenuItems
                                            transition
                                            className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
                                        >
                                            {userNavigation.map((item) => (
                                                <MenuItem key={item.name}>
                                                    {({ focus }) => (
                                                        <button
                                                            className={classNames(
                                                                focus ? 'bg-gray-100' : '',
                                                                'block px-4 py-2 text-sm text-gray-700 w-full text-left',
                                                            )}
                                                            onClick={() => handleNavigation(item)}
                                                        >
                                                            {item.name}
                                                        </button>
                                                    )}
                                                </MenuItem>
                                            ))}
                                        </MenuItems>
                                    </Menu>
                                </div>
                            </div>
                            <div className="-mr-2 flex md:hidden">
                                {/* Mobile menu button */}
                                <DisclosureButton className="relative inline-flex items-center justify-center rounded-md bg-green-800 p-2 text-gray-200 hover:bg-green-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-green-800">
                                    <span className="absolute -inset-0.5" />
                                    <span className="sr-only">Open main menu</span>
                                    {open ? (
                                        <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                                    ) : (
                                        <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                                    )}
                                </DisclosureButton>
                            </div>
                        </div>
                    </div>

                    <DisclosurePanel className="md:hidden">
                        <div className="space-y-1 px-2 pb-3 pt-2 sm:px-3">
                            {navigation.map((item) => (
                                <DisclosureButton
                                    key={item.name}
                                    className={classNames(
                                        item.route === router.pathname ? 'bg-green-50 text-gray-800' : 'text-gray-300 hover:bg-green-700 hover:text-white',
                                        'block rounded-md px-3 py-2 text-base font-medium',
                                    )}
                                    aria-current={item.route === router.pathname ? 'page' : undefined}
                                    onClick={() => handleNavigation(item)}
                                >
                                    {item.name}
                                </DisclosureButton>
                            ))}
                        </div>
                        <div className="border-t border-green-700 pb-3 pt-4">
                            <div className="flex items-center px-5">
                                <div className="flex-shrink-0">
                                    <Image
                                        src={user?.image || ''}
                                        alt=""
                                        width={75}
                                        height={75}
                                        className="h-10 w-10 rounded-full"
                                    />
                                </div>
                                <div className="ml-3">
                                    <div className="text-base font-medium leading-none text-white">{user?.name}</div>
                                    <div className="text-sm font-medium leading-none text-gray-300">{user?.email}</div>
                                </div>
                                <button
                                    type="button"
                                    className="relative ml-auto flex-shrink-0 rounded-full bg-green-800 p-1 text-gray-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-green-800"
                                >
                                    <span className="absolute -inset-1.5" />
                                    <span className="sr-only">View notifications</span>
                                    <BellIcon className="h-6 w-6" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="mt-3 space-y-1 px-2">
                                {userNavigation.map((item) => (
                                    <DisclosureButton
                                        key={item.name}
                                        className="block rounded-md px-3 py-2 text-base font-medium text-gray-300 hover:bg-green-700 hover:text-white"
                                        onClick={() => handleNavigation(item)}
                                    >
                                        {item.name}
                                    </DisclosureButton>
                                ))}
                            </div>
                        </div>
                    </DisclosurePanel>
                </>
            )}
        </Disclosure>
    )
}

export default Header
const Loading = () => (
    <div className="flex items-center justify-center mt-5">
        <div className="relative">
            <div className="h-24 w-24 rounded-full border-t-8 border-b-8 border-gray-200"></div>
            <div className="absolute top-0 left-0 h-24 w-24 rounded-full border-t-8 border-b-8 border-blue-500 animate-spin">
            </div>
        </div>
    </div>
)

export default Loading;import * as https from 'https';
import { Transform as Stream } from 'stream';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
import { UploadReturnType } from '../types';

// Define an interface for the upload parameters
interface UploadToS3Type {
    originalImgLink: string | undefined;
    userId: string | undefined;
    location: string;
}

// Function to process the image from the URL and return it as a stream
export const processImage = (url: string): Promise<StreamingBlobPayloadInputTypes> =>
    new Promise((resolve, reject) => {
        const request = https.request(url, (response) => {
            const data = new Stream();
            response.on('data', (chunk: Buffer) => {
                data.push(chunk);
            });

            response.on('end', () => {
                resolve(data.read());
            });
        });

        request.on('error', (err: string) => {
            reject(err);
        });
        request.end();
    });

// Function to configure the S3 client
export const configureS3 = () => (
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? new S3Client({
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
            region: 'us-east-1',
        })
        : null
);

// Function to upload a single image to S3
export const uploadImageToS3 = async ({
    originalImgLink,
    userId,
    location
}: UploadToS3Type): Promise<UploadReturnType> => {
    try {
        if (!originalImgLink) throw new Error('Image link is undefined');

        const s3 = configureS3();
        if (!s3) throw new Error('Unable to configure S3');

        const Body = await processImage(originalImgLink);

        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME || '',
            Key: location,
            Body,
            ContentType: 'image/png',
            Tagging: `userId=${userId}`,
        });
        s3.send(command);
        return {
            location,
            uploaded: true
        }
    } catch (error) {
        console.error(`Error uploading image. ${originalImgLink?.slice(0, 50)}... - ${error}`);
        return {
            location,
            uploaded: false
        };
    }
};

// Function to upload multiple images to S3
export const uploadImagesToS3 = async (openaiImagesArray: UploadToS3Type[]): Promise<UploadReturnType[] | null> => {
    try {
        const imagePromises: Promise<UploadReturnType>[] = openaiImagesArray.map(img => uploadImageToS3(img));
        const results = await Promise.all(imagePromises);
        return results;
    } catch (error) {
        console.error(error);
        return null;
    }
};
import OpenAI from 'openai';
import { Ingredient, DietaryPreference, Recipe } from '../types/index'
import aiGenerated from './models/aigenerated';
import { connectDB } from '../lib/mongodb';
import { ImagesResponse } from 'openai/resources';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const saveOpenaiResponses = async ({ userId, prompt, response }: { userId: string, prompt: string, response: any }) => {
    try {
        await connectDB();
        const { _id } = await aiGenerated.create({
            userId,
            prompt,
            response,
        });
        return _id
    } catch (error) {
        console.error('Failed to save response to db:', error);
        return null
    }
}

const getRecipeGenerationPrompt = (ingredients: Ingredient[], dietaryPreferences: DietaryPreference[]) => `
I have the following ingredients: ${JSON.stringify(ingredients)} ${dietaryPreferences.length ? `and dietary preferences: ${dietaryPreferences.join(',')}` : ''}. Please provide me with three different delicious recipes. The response should be in the following JSON format without any additional text or markdown:
[
    {
        "name": "Recipe Name",
        "ingredients": [
            {"name": "Ingredient 1", "quantity": "quantity and unit"},
            {"name": "Ingredient 2", "quantity": "quantity and unit"},
            ...
        ],
        "instructions": [
            "Step 1",
            "Step 2",
            ...
        ],
        "dietaryPreference": ["Preference 1", "Preference 2", ...],
        "additionalInformation": {
            "tips": "Some cooking tips or advice.",
            "variations": "Possible variations of the recipe.",
            "servingSuggestions": "Suggestions for serving the dish.",
            "nutritionalInformation": "Nutritional information about the recipe."
        }
    },
    ...
]
Please ensure the recipes are diverse and use the ingredients listed. The recipes should follow the dietary preferences provided.The instructions should be ordered but not include the step numbers.
`;

const getImageGenerationPrompt = (recipeName: string, ingredients: Recipe['ingredients']): string => {
    const allIngredients = ingredients.map(ingredient => `${ingredient.name}`).join(', ');
    const prompt = `Create an image of a delicious ${recipeName} made of these ingredients: ${allIngredients}. The image should be visually appealing and showcase the dish in an appetizing manner.`;
    return prompt;
};
const getIngredientValidationPrompt = (ingredientName: string): string => {
    return `You are a food ingredient validation assistant. Given this ingredient name: ${ingredientName}, you will respond with a JSON object in the following format:

{
  "isValid": true/false,
  "possibleVariations": ["variation1", "variation2", "variation3"]
}

The "isValid" field should be true if the ingredient is commonly used in recipes and false otherwise. The "possibleVariations" field should be an array containing 2 or 3 variations or related ingredients to the provided ingredient name. If no variations or related ingredients are real and commonly used, return an empty array.

Do not include any Markdown formatting or code blocks in your response. Return only valid JSON.`
}


type ResponseType = {
    recipes: string | null
    openaiPromptId: string
}
export const generateRecipe = async (ingredients: Ingredient[], dietaryPreferences: DietaryPreference[], userId: string): Promise<ResponseType> => {
    try {
        const prompt = getRecipeGenerationPrompt(ingredients, dietaryPreferences);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: prompt,
            }],
            max_tokens: 1500,
        });

        const _id = await saveOpenaiResponses({ userId, prompt, response })

        return { recipes: response.choices[0].message?.content, openaiPromptId: _id || 'null-prompt-id' }
    } catch (error) {
        console.error('Failed to generate recipe:', error);
        throw new Error('Failed to generate recipe');
    }
};


// Function to call the OpenAI API to generate an image
const generateImage = (prompt: string): Promise<ImagesResponse> => {
    try {
        const response = openai.images.generate({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1024x1024',
        });

        // Return the response containing the image data
        return response;
    } catch (error) {
        throw new Error('Failed to generate image');
    }
};


export const generateImages = async (recipes: Recipe[], userId: string) => {
    try {
        const imagePromises: Promise<ImagesResponse>[] = recipes.map(recipe => generateImage(getImageGenerationPrompt(recipe.name, recipe.ingredients)));

        const images = await Promise.all(imagePromises);

        await saveOpenaiResponses({
            userId,
            prompt: `Image generation for recipe names ${recipes.map(r => r.name).join(' ,')} (note: not exact prompt)`,
            response: images
        })

        const imagesWithNames = images.map((imageResponse, idx) => (
            {
                imgLink: imageResponse.data[0].url,
                name: recipes[idx].name,
            }
        ));

        return imagesWithNames;
    } catch (error) {
        console.error('Error generating image:', error);
        throw new Error('Failed to generate image');
    }

};

export const validateIngredient = async (ingredientName: string, userId: string): Promise<string | null> => {
    try {
        const prompt = getIngredientValidationPrompt(ingredientName);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: prompt,
            }],
            max_tokens: 800,
        });

        await saveOpenaiResponses({ userId, prompt, response })

        return response.choices[0].message?.content
    } catch (error) {
        console.error('Failed to validate ingredient:', error);
        throw new Error('Failed to validate ingredient');
    }
};
import mongoose, { Model }  from 'mongoose';

export interface AccountType {
    provider: string,
    type: string,
    providerAccountId: string,
    access_token: string,
    expires_at: number,
    scope: string,
    token_type: string,
    id_token: string
}

// define the schema for our user model
const accountSchema = new mongoose.Schema({
  provider: String,
  type: String,
  providerAccountId: String,
  access_token: String,
  expires_at: Number,
  scope: String,
  token_type: String,
  id_token: String
});

const Account: Model<AccountType> = mongoose.models.Account || mongoose.model<AccountType>('Account', accountSchema);

export default Accountimport mongoose, { Model }  from 'mongoose';
import User from './user';
import { RecipeDocument } from '../../types/index'

const commentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: User },
    comment: { type: String, required: true },
}, {
    timestamps: true,
});

const tagSchema = new mongoose.Schema({
    tag: { type: String, required: true },
});

const ingredientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    quantity: { type: String || undefined, required: true },
});

const recipeSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: User },
    name: { type: String, required: true },
    ingredients: [ingredientSchema],
    instructions: [{ type: String, required: true }],
    dietaryPreference: [{ type: String, required: true }],
    additionalInformation:{
        tips: { type: String, required: true },
        variations: { type: String, required: true },
        servingSuggestions: { type: String, required: true },
        nutritionalInformation: { type: String, required: true },
    },
    imgLink: { type: String },
    openaiPromptId: {type: String, required: true},
    likedBy: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: User }],
        default: [],
    },
    comments: {
        type: [commentSchema],
        default: [],
    },
    tags: {
        type: [tagSchema],
        default: [],
    },
}, { timestamps: true });

const Recipe: Model<RecipeDocument> = mongoose.models.Recipe || mongoose.model<RecipeDocument>('Recipe', recipeSchema);

export default Recipe;import mongoose, { Model }  from 'mongoose';
import User from './user';
import { IngredientDocumentType } from '../../types';


// define the schema for our user model
const ingredientSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      unique: true, // Ensure ingredient names are unique
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: User, // Reference to the User model (if applicable)
      default: null, // Default to null for pre-defined ingredients
    }
  }, { timestamps: true });
  
  const Ingredient: Model<IngredientDocumentType> = mongoose.models.Ingredient || mongoose.model<IngredientDocumentType>('Ingredient', ingredientSchema);

  export default Ingredient;import mongoose, { Model }  from 'mongoose';

export interface UserType {
    _id: string,
    name: string,
    email: string,
    image: string,
    emailVerified: string | null,
    createdAt: string,
}

// define the schema for our user model
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  image: String,
  emailVerified: String || null,
}, { timestamps: true });

const User: Model<UserType> = mongoose.models.User || mongoose.model<UserType>('User', userSchema);

export default Userimport mongoose from 'mongoose';

const AIgeneratedSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    prompt: { type: String, required: true },
    response: { type: Object, required: true },
  }, { timestamps: true });
  
  export default mongoose.models.AIgenerated || mongoose.model('AIgenerated', AIgeneratedSchema);import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI || '';
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!process.env.MONGO_URI) {
    throw new Error('Please add your Mongo URI to .env.local');
}

if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so the client is not constantly reinitialized.
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

// Function to connect to MongoDB using Mongoose
const connectDB = async () => {
    if (mongoose.connections[0].readyState) return;

    try {
        await mongoose.connect(uri);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw new Error('MongoDB connection failed');
    }
};

// Export a module-scoped MongoClient promise. By doing this in a separate
// module, the client can be shared across functions.
export { clientPromise, connectDB };
// pages/index.tsx
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Loading from '../components/Loading';

export default function Index() {
  const router = useRouter()
  useEffect(() => {
    router.push('/Home')
  }, [router])
  return <Loading />;
}import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import Product from '../components/Hero_Sections/Product';
import Features from '../components/Hero_Sections/Features';
import Landing from '../components/Hero_Sections/Landing';
import ErrorPage from './auth/error';

// Navigation links for the header
const navigation = [
    { name: 'Product', key: 'product' },
    { name: 'Features', key: 'features' },
    { name: 'About', key: 'about' },
];

export default function Hero() {
    // State to manage the mobile menu open/close state
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // State to manage the currently selected page
    const [selectedPage, setSelectedPage] = useState<string | null>(null);

    // Fetch the current session and status
    const { data: session } = useSession();

    // Function to render the content based on the selected page
    const renderContent = () => {
        switch (selectedPage) {
            case 'product':
                return (
                    <Product resetPage={() => setSelectedPage(null)} />
                );
            case 'features':
                return (
                    <Features resetPage={() => setSelectedPage(null)} />
                );
            case 'about':
                window.open('https://github.com/ml3m', '_blank');
                setSelectedPage(null);
                return (
                    <Landing />
                );
            default:
                return (
                    <Landing />
                );
        }
    };

    // If the user is logged in, show the error page
    if (session) return <ErrorPage message='Inaccessible Page' />;

    return (
        <div className="bg-white">
            {/* Header section */}
            <header className="absolute inset-x-0 top-0 z-50">
                <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
                    <div className="flex lg:flex-1">
                        <a href="#" className="-m-1.5 p-1.5">
                            <span className="sr-only">Smart Recipe Generator</span>
                            <Image src="/logo.svg" alt="Smart Recipe Generator Logo" width={75} height={75} />
                        </a>
                    </div>
                    <div className="flex lg:hidden">
                        <button
                            type="button"
                            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
                            onClick={() => setMobileMenuOpen(true)}
                        >
                            <span className="sr-only">Open main menu</span>
                            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="hidden lg:flex lg:gap-x-12">
                        {navigation.map((item) => (
                            <button
                                key={item.name}
                                onClick={() => setSelectedPage(item.key)}
                                className="text-sm font-semibold leading-6 text-gray-900"
                            >
                                {item.name}
                            </button>
                        ))}
                    </div>
                    <div className="hidden lg:flex lg:flex-1 lg:justify-end">
                        <button className="text-sm font-semibold leading-6 text-gray-900" onClick={() => signIn('google')}>
                            Log in With Google <span aria-hidden="true">&rarr;</span>
                        </button>
                    </div>
                </nav>
                {/* Mobile menu dialog */}
                <Dialog className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
                    <div className="fixed inset-0 z-50" />
                    <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10">
                        <div className="flex items-center justify-between">
                            <a href="#" className="-m-1.5 p-1.5">
                                <span className="sr-only">Smart Recipe Generator</span>
                                <Image src="/logo.svg" alt="Smart Recipe Generator Logo" width={75} height={75} />
                            </a>
                            <button
                                type="button"
                                className="-m-2.5 rounded-md p-2.5 text-gray-700"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <span className="sr-only">Close menu</span>
                                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="mt-6 flow-root">
                            <div className="-my-6 divide-y divide-gray-500/10">
                                <div className="space-y-2 py-6">
                                    {navigation.map((item) => (
                                        <button
                                            key={item.name}
                                            onClick={() => {
                                                setSelectedPage(item.key);
                                                setMobileMenuOpen(false);
                                            }}
                                            className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 w-full text-left"
                                        >
                                            {item.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="py-6">
                                    <button
                                        className="-mx-3 block rounded-lg px-3 py-2.5 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 w-full text-left"
                                        onClick={() => signIn('google')}
                                    >
                                        Log in With Google
                                    </button>
                                </div>
                            </div>
                        </div>
                    </DialogPanel>
                </Dialog>
            </header>

            {/* Main content section */}
            <div className="relative isolate px-6 pt-14 lg:px-8">
                <div
                    className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
                    aria-hidden="true"
                >
                    <div
                        className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
                        style={{
                            clipPath:
                                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
                        }}
                    />
                </div>
                <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
                    <div className="hidden sm:mb-8 sm:flex sm:justify-center">
                        <div className="relative rounded-full px-3 py-1 text-sm leading-6 text-gray-600 ring-1 ring-gray-900/10 hover:ring-gray-900/20">
                            Discover our new AI-powered recipe generator.{' '}
                            <a href="https://github.com/ml3m" className="font-semibold text-indigo-600">
                                <span className="absolute inset-0" aria-hidden="true" />
                                Learn more <span aria-hidden="true">&rarr;</span>
                            </a>
                        </div>
                    </div>
                    {renderContent()}
                </div>
                <div
                    className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
                    aria-hidden="true"
                >
                    <div
                        className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
                        style={{
                            clipPath:
                                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ErrorPage({ message }: { message?: string }) {
    const router = useRouter();
    const { error } = router.query;

    let errorMessage = `An unexpected error: "${error}" occurred. Please try again later.`;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
            <h1 className="text-3xl font-bold mb-4">{message || 'Sign In Error'}</h1>
            <p className="text-red-500 mb-4">{message ? '' : errorMessage}</p>
            <Link href="/" className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Go to Home
            </Link>
        </div>
    );
}
import { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { Button, Input } from '@headlessui/react'
import ViewRecipes from '../components/Recipe_Display/ViewRecipes';
import ScrollToTopButton from '../components/ScrollToTopButton';
import { getFilteredRecipes, getServerSidePropsUtility, updateRecipeList } from '../utils/utils';
import { ExtendedRecipe } from '../types';


const initialSearchView: ExtendedRecipe[] = []

function Home({ recipes }: { recipes: ExtendedRecipe[] }) {
    const [latestRecipes, setLatestRecipes] = useState(recipes);
    const [searchVal, setSearchVal] = useState('')
    const [searchView, setSearchView] = useState(initialSearchView)

    useEffect(() => {
        if (!searchVal.trim()) {
            setSearchView(latestRecipes)
        }
    }, [searchVal, latestRecipes])

    const handleRecipeListUpdate = (recipe: ExtendedRecipe | null, deleteId?: string) => {
        setLatestRecipes(updateRecipeList(latestRecipes, recipe, deleteId));
    }

    const handleSearch = () => {
        const filteredRecipes = getFilteredRecipes(latestRecipes, searchVal.trim().toLowerCase());
        setSearchView(filteredRecipes)
    }

    return (

        <div className="flex flex-col min-h-screen items-center">
            <div className="w-full flex items-center justify-between p-4 rounded-lg shadow-md">
                <Input
                    className="w-full px-4 py-2 text-sm text-gray-700 placeholder-gray-500 bg-white border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-transparent"
                    placeholder="Search recipes by name, ingredient, or type..."
                    value={searchVal}
                    onChange={(e) => setSearchVal(e.target.value)}
                />
                <Button
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-100 hover:shadow"
                    onClick={handleSearch}
                >
                    Search
                </Button>
                <Button
                    className="px-1 py-1 text-black font-bold bg-blue-300 rounded-r-lg hover:enabled:bg-blue-100 focus:enabled:outline-none hover:enabled:shadow data-[disabled]:bg-gray-200 data-[disabled]:text-black/10"
                    onClick={() => setSearchVal('')}
                    disabled={!searchVal.trim()}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-7">
                        <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                </Button>
            </div>
            <ViewRecipes recipes={searchView} handleRecipeListUpdate={handleRecipeListUpdate} />
            <ScrollToTopButton />
        </div>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    return await getServerSidePropsUtility(context, 'api/get-recipes')
};

export default Home;import { GetServerSideProps } from 'next';
import { useState } from 'react';
import ProfileInformation from '../components/Profile_Information/ProfileInformation';
import ViewRecipes from '../components/Recipe_Display/ViewRecipes';
import { getServerSidePropsUtility, updateRecipeList } from '../utils/utils';
import { ExtendedRecipe } from '../types';

function Profile({ recipes }: { recipes: ExtendedRecipe[] }) {
    const [latestRecipes, setLatestRecipes] = useState(recipes);
    const [displaySetting, setDisplaySetting] = useState('created')

    const handleRecipeListUpdate = (recipe: ExtendedRecipe | null, deleteId?: string) => {
        setLatestRecipes(updateRecipeList(latestRecipes, recipe, deleteId));
    }

    const handleDisplaySetting = () => {
        let view: ExtendedRecipe[] = []
        if (displaySetting === 'created') {
            view = latestRecipes.filter(r => r.owns);
        } else if (displaySetting === 'favorites') {
            view = latestRecipes.filter(r => r.liked);
        } else {
            view = latestRecipes.filter(r => r.owns && r.likedBy.length > 0);
        }
        return view;
    }
    return (
        <div className="flex flex-col min-h-screen items-center">
            <ProfileInformation recipes={latestRecipes} updateSelection={(val) => setDisplaySetting(val)} selectedDisplay={displaySetting} />
            <ViewRecipes recipes={handleDisplaySetting()} handleRecipeListUpdate={handleRecipeListUpdate} />
        </div>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    return await getServerSidePropsUtility(context, 'api/profile')
};

export default Profile;import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { connectDB } from '../../lib/mongodb';
import recipes from '../../lib/models/recipe';

/**
 * API handler for deleting a recipe.
 * @param req - The Next.js API request object.
 * @param res - The Next.js API response object.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        // Only allow GET requests
        if (req.method !== 'DELETE') {
            res.setHeader('Allow', ['DELETE']);
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        // Get the user session
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            const error = 'You must be logged in.'
            console.error(error)
            return res.status(401).json({ error });
        }

        // Validate recipeId
        const { recipeId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(recipeId)) {
            const error = "Invalid recipe ID"
            console.error(error)
            return res.status(400).json({ error });
        }

        // Connect to the database
        await connectDB();

        // Find the recipe by ID
        const recipe = await recipes.findById(recipeId).exec();
        if (!recipe) {
            const error = `Recipe with Id: ${recipeId} not found... exiting DELETE`
            console.error(error)
            return res.status(400).json({ error  });
        }

        // Ensure that the user owns the recipe
        if (session.user.id !== recipe.owner.toString()) {
            const error = `Recipe with Id: ${recipeId} is not owned by userId: ${session.user.id}... exiting DELETE`
            console.error(error)
            return res.status(400).json({ error });
        }
        // Delete the recipe
        await recipes.findByIdAndDelete(recipeId).exec();
        console.info(`User id: ${session.user.id} deleted recipe id:${recipeId}`)
        res.status(200).json({ message: `Deleted recipe with id ${recipeId}` });
    } catch (error) {
        // Handle any errors that occur during fetching recipes
        console.error(error);
        res.status(500).json({ error: 'Failed to delete recipe' });
    }
};

export default handler;
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import { clientPromise } from '../../../lib/mongodb';
import type { NextAuthOptions } from "next-auth"

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        }),
    ],
    adapter: MongoDBAdapter(clientPromise),
    pages: {
        signIn: '/auth/signin',
        signOut: '/auth/signout',
        error: '/auth/error', // Error code passed in query string as ?error=
        verifyRequest: '/auth/verify-request', // (used for check email message)
        newUser: undefined // If set, new users will be directed here on first sign in
    },
    callbacks: {
        async session({ session, token, user }) {
            // Send properties to the client, like an access_token and user id from a provider.
            session.user.id = user.id;
            return session
        },
        async redirect({ url, baseUrl }) {
            // Always redirect to the index page after sign-in
            return baseUrl; // this is equivalent to '/'
        }
    },
    
}

export default NextAuth(authOptions)import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import { validateIngredient } from '../../lib/openai';
import Ingredient from '../../lib/models/ingredient';
import mongoose from 'mongoose';

/**
 * API handler for validating and adding a new ingredient.
 * @param req - The Next.js API request object.
 * @param res - The Next.js API response object.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        // Only allow POST requests
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        // Get the user session
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: 'You must be logged in.' });
        }

        // Extract ingredient name from the request body
        const { ingredientName } = req.body;
        const userId = session.user.id;

        // Validate ingredient name input
        if (!ingredientName) {
            return res.status(400).json({ error: 'Ingredient name is required' });
        }

        // Validate ingredient using OpenAI
        console.info('Validating ingredient from OpenAI...');
        const response = await validateIngredient(ingredientName, userId);
        const parsedResponse = response ? JSON.parse(response) : null;

        if (parsedResponse) {
            const formattedIngredientName = ingredientName[0].toUpperCase() + ingredientName.slice(1).toLowerCase();
            const ingredientExists = await Ingredient.findOne({ name: formattedIngredientName });

            if (parsedResponse.isValid) {
                if (!ingredientExists) {
                    // Create new ingredient if it does not exist
                    const newIngredient = await Ingredient.create({
                        name: formattedIngredientName,
                        createdBy: new mongoose.Types.ObjectId(userId)
                    });
                    return res.status(200).json({
                        message: 'Success',
                        newIngredient
                    });
                } else {
                    // Respond with error if ingredient already exists
                    return res.status(200).json({
                        message: 'Error: This ingredient already exists'
                    });
                }
            } else {
                // Respond with invalid ingredient and possible variations
                return res.status(200).json({
                    message: 'Invalid',
                    suggested: parsedResponse.possibleVariations
                });
            }
        } else {
            // Handle error in parsing response
            return res.status(200).json({
                message: 'Error with parsing response'
            });
        }
    } catch (error) {
        // Handle any errors that occur during the process
        console.error(error);
        return res.status(500).json({ error: 'Failed to add ingredient' });
    }
};

export default handler;
import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import { connectDB } from '../../lib/mongodb';
import Recipe from '../../lib/models/recipe';
import { filterResults } from '../../utils/utils';
import { ExtendedRecipe } from '../../types';

/**
 * API handler for fetching recipes owned or liked by the user.
 * @param req - The Next.js API request object.
 * @param res - The Next.js API response object.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        // Only allow GET requests
        if (req.method !== 'GET') {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        // Get the user session
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: 'You must be logged in.' });
        }

        // Convert session user ID to a mongoose ObjectId
        const mongooseUserId = new mongoose.Types.ObjectId(session.user.id);

        // Connect to the database
        await connectDB();

        // Fetch recipes owned or liked by the user
        const profilePins = await Recipe.find({
            $or: [{ owner: mongooseUserId }, { likedBy: mongooseUserId }],
        })
            .populate(['owner', 'likedBy', 'comments.user'])
            .lean()
            .exec() as unknown as ExtendedRecipe[];

        // Filter results based on user session and respond with the filtered recipes
        const filteredRecipes = filterResults(profilePins, session.user.id);
        res.status(200).json(filteredRecipes);
    } catch (error) {
        // Handle any errors that occur during fetching recipes
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch recipes' });
    }
};

export default handler;
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { connectDB } from '../../lib/mongodb';
import Ingredient from '../../lib/models/ingredient';
import aigenerated from '../../lib/models/aigenerated';
import { IngredientDocumentType } from '../../types';

// Define the possible shapes of the API response
type Data = IngredientDocumentType[] | {
    error: string
} | {
    [key: string]: any;
};

// Export the default async handler function for the API route
export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
    try {
        // Retrieve the user's session using NextAuth
        const session = await getServerSession(req, res, authOptions);
        
        // If no session exists, respond with a 401 Unauthorized error
        if (!session) {
            return res.status(401).json({ error: 'You must be logged in.' });
        }

        // Establish a connection to the MongoDB database
        await connectDB();

        // Count the number of AI-generated entries associated with the user's ID
        const totalGeneratedCount = await aigenerated.countDocuments({ userId: session.user.id }).exec();

        // Check if the user has exceeded the API request limit
        if (totalGeneratedCount >= Number(process.env.API_REQUEST_LIMIT)) {
            // If limit is reached, respond with reachedLimit flag and an empty ingredient list
            res.status(200).json({
                reachedLimit: true,
                ingredientList: []
            });
            return;
        }

        // Retrieve all ingredients from the database, sorted alphabetically by name
        const allIngredients = await Ingredient.find().sort({ name: 1 }).exec() as unknown as IngredientDocumentType[];

        // Respond with the list of ingredients and reachedLimit flag as false
        res.status(200).json({
            reachedLimit: false,
            ingredientList: allIngredients
        });
    } catch (error) {
        // Log any errors to the server console for debugging
        console.error(error);
        
        // Respond with a 500 Internal Server Error and an error message
        res.status(500).json({ error: 'Failed to fetch ingredients' });
    }
}
import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { connectDB } from '../../lib/mongodb';
import recipes from '../../lib/models/recipe';
import { filterResults } from '../../utils/utils';
import { ExtendedRecipe } from '../../types';

const toggleLike = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        // Only allow PUT requests
        if (req.method !== 'PUT') {
            res.setHeader('Allow', ['PUT']);
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        // Get the user session
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: "You must be logged in." });
        }

        // Validate recipeId
        const { recipeId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(recipeId)) {
            return res.status(400).json({ error: "Invalid recipe ID" });
        }

        // Connect to the database
        await connectDB();
        
        // Find the recipe by ID
        const recipe = await recipes.findById(recipeId).exec();
        if (!recipe) {
            res.end(`Recipe with Id: ${recipeId} not found... exiting`);
            return;
        }

        // Toggle the like status
        const liked = recipe.likedBy.some((r) => r.toString() === session.user.id);
        const update = liked
            ? { $pull: { likedBy: new mongoose.Types.ObjectId(session.user.id) } }
            : { $addToSet: { likedBy: new mongoose.Types.ObjectId(session.user.id) } };

        // Update the recipe with the new likes array
        const updatedRecipe = await recipes.findByIdAndUpdate(recipeId, update, { new: true })
            .populate(['owner', 'likedBy', 'comments.user'])
            .lean()
            .exec() as unknown as ExtendedRecipe;

        if (!updatedRecipe) {
            res.end(`Recipe with Id: ${recipeId} unable to return document.. exiting`);
            return;
        }

        // Filter and update the recipe data
        const [filteredAndUpdatedRecipe] = filterResults([updatedRecipe], session.user.id);
        res.status(200).json(filteredAndUpdatedRecipe);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to like recipe' });
    }
};

export default toggleLike;import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { connectDB } from '../../lib/mongodb';
import Recipe from '../../lib/models/recipe';
import { filterResults } from '../../utils/utils';
import { ExtendedRecipe } from '../../types';

/**
 * API handler for fetching all recipes.
 * @param req - The Next.js API request object.
 * @param res - The Next.js API response object.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // Get the user session
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'You must be logged in.' });
    }

    // Connect to the database
    await connectDB();

    // Fetch all recipes from the database and populate necessary fields
    const allRecipes = await Recipe.find()
      .populate(['owner', 'likedBy', 'comments.user'])
      .lean()
      .exec() as unknown as ExtendedRecipe[];

    // Filter results based on user session and respond with the filtered recipes
    const filteredRecipes = filterResults(allRecipes, session.user.id);
    res.status(200).json(filteredRecipes);
  } catch (error) {
    // Handle any errors that occur during fetching recipes
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
};

export default handler;
import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { generateImages } from '../../lib/openai';
import { uploadImagesToS3 } from '../../lib/awss3';
import { authOptions } from '../api/auth/[...nextauth]';
import { getServerSession } from 'next-auth/next';
import { connectDB } from '../../lib/mongodb';
import recipe from '../../lib/models/recipe';
import { Recipe, UploadReturnType } from '../../types';

/**
 * Helper function to get the S3 link for an uploaded image.
 * @param uploadResults - The results of the S3 upload operation.
 * @param location - The location identifier for the image.
 * @returns The URL of the image in S3 or a fallback image URL.
 */
const getS3Link = (uploadResults: UploadReturnType[] | null, location: string) => {
    const fallbackImg = '/logo.svg';
    if (!uploadResults) return fallbackImg;
    const filteredResult = uploadResults.filter(result => result.location === location);
    if (filteredResult[0]?.uploaded) {
        return `https://smart-recipe-generator.s3.amazonaws.com/${location}`;
    }
    return fallbackImg;
};

/**
 * API handler for generating images for recipes, uploading them to S3, and saving the recipes to MongoDB.
 * @param req - The Next.js API request object.
 * @param res - The Next.js API response object.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        // Only allow POST requests
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        // Get the user session
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: 'You must be logged in.' });
        }

        // Extract recipes from the request body
        const { recipes } = req.body;
        const recipeNames = recipes.map(({ name, ingredients }: Recipe) => ({ name, ingredients }));

        // Generate images using OpenAI
        console.info('Getting images from OpenAI...');
        const imageResults = await generateImages(recipeNames, session.user.id);
        
        // Prepare images for uploading to S3
        const openaiImagesArray = imageResults.map((result, idx) => ({
            originalImgLink: result.imgLink,
            userId: session.user.id,
            location: recipes[idx].openaiPromptId
        }));

        // Upload images to S3
        console.info('Uploading OpenAI images to S3...');
        const uploadResults = await uploadImagesToS3(openaiImagesArray);

        // Update recipe data with image links and owner information
        const updatedRecipes = recipes.map((r: Recipe) => ({
            ...r,
            owner: new mongoose.Types.ObjectId(session.user.id),
            imgLink: getS3Link(uploadResults, r.openaiPromptId),
            openaiPromptId: r.openaiPromptId.split('-')[0] // Remove client key iteration
        }));

        // Connect to MongoDB and save recipes
        await connectDB();
        await recipe.insertMany(updatedRecipes);
        console.info(`Successfully saved ${recipes.length} recipes to MongoDB`);

        // Respond with success message
        res.status(200).json({ status: 'Saved Recipes and generated the Images!' });
    } catch (error) {
        // Handle any errors that occur during the process
        console.error('Failed to send response:', error);
        res.status(500).json({ error: 'Failed to save recipes' });
    }
};

export default handler;
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import { generateRecipe } from '../../lib/openai';

/**
 * API handler for generating recipes based on provided ingredients and dietary preferences.
 * @param req - The Next.js API request object.
 * @param res - The Next.js API response object.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        // Only allow POST requests
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        // Get the user session
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: 'You must be logged in.' });
        }

        // Extract ingredients and dietary preferences from request body
        const { ingredients, dietaryPreferences } = req.body;

        // Validate ingredients input
        if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
            return res.status(400).json({ error: 'Ingredients are required' });
        }

        // Generate recipes using OpenAI API
        console.info('Generating recipes from OpenAI...');
        const response = await generateRecipe(ingredients, dietaryPreferences, session.user.id);

        // Respond with the generated recipes
        res.status(200).json(response);
    } catch (error) {
        // Handle any errors that occur during recipe generation
        console.error(error);
        res.status(500).json({ error: 'Failed to generate recipes' });
    }
};

export default handler;
import { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Loading from '../components/Loading';
import Head from 'next/head'
import Layout from '../components/Layout';
import '../styles/globals.css';

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const start = () => {
            setLoading(true);
        };
        const end = () => {
            setLoading(false);
        };
        router.events.on('routeChangeStart', start)
        router.events.on('routeChangeComplete', end)
        router.events.on('routeChangeError', end)
        // If the component is unmounted, unsubscribe
        // from the event with the `off` method:
        return () => {
            router.events.off('routeChangeStart', start)
            router.events.off('routeChangeComplete', end)
            router.events.off('routeChangeError', end)
        }
    }, [router])

    return loading ? <Loading /> : (
        <SessionProvider session={session}>
            <Layout>
                <Head>
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
                </Head>
                <Component {...pageProps} />
            </Layout>
        </SessionProvider>
    );
}

export default MyApp;
import { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { Button } from '@headlessui/react'
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';
import Loading from '../components/Loading';
import StepComponent from '../components/Recipe_Creation/StepComponent';
import LimitReached from '../components/Recipe_Creation/LimitReached';
import { call_api } from '../utils/utils';
import { getServerSidePropsUtility } from '../utils/utils';
import { Ingredient, DietaryPreference, Recipe, IngredientDocumentType } from '../types/index'

const steps = ['Choose Ingredients', 'Choose Diet', 'Review and Create Recipes', 'Select Recipes', 'Review and Save Recipes']



const initialIngridients: Ingredient[] = []
const initialPreferences: DietaryPreference[] = [];
const initialRecipes: Recipe[] = [];
const initialSelectedIds: string[] = [];

function Navigation({ recipeCreationData }: {
    recipeCreationData: {
        ingredientList: IngredientDocumentType[]
        reachedLimit: boolean
    }
}) {
    const [step, setStep] = useState(0);
    const [ingredients, setIngredients] = useState(initialIngridients)
    const [preferences, setPreferences] = useState(initialPreferences)
    const [generatedRecipes, setGeneratedRecipes] = useState(initialRecipes)
    const [selectedRecipeIds, setSelectedRecipeIds] = useState(initialSelectedIds)
    const [isLoading, setIsLoading] = useState(false)

    const router = useRouter();
    const { oldIngredients } = router.query;

    useEffect(() => {
        if (oldIngredients && Array.isArray(oldIngredients)) {
            setIngredients(oldIngredients.map(i => ({ name: i, quantity: null, id: uuidv4() })))
        }
    }, [oldIngredients])

    const updateStep = (val: number) => {
        let newStep = step + val
        if (newStep < 0 || newStep >= steps.length) newStep = 0
        setStep(newStep)
    }

    const handleIngredientSubmit = async () => {
        try {
            setIsLoading(true);
            const { recipes, openaiPromptId } = await call_api({
                address: '/api/generate-recipes',
                method: 'post',
                payload: {
                    ingredients,
                    dietaryPreferences: preferences,
                }
            });
            let parsedRecipes = JSON.parse(recipes);
            parsedRecipes = parsedRecipes.map((recipe: Recipe, idx: number) => ({
                ...recipe,
                openaiPromptId: `${openaiPromptId}-${idx}` // make unique for client key iteration
            }))
            setIsLoading(false)
            setGeneratedRecipes(parsedRecipes)
            setStep(step + 1)
        } catch (error) {
            console.log(error)
        }
    }

    const handleRecipeSubmit = async (recipes: Recipe[]) => {
        try {
            setIsLoading(true);
            await call_api({ address: '/api/save-recipes', method: 'post', payload: { recipes } });
            setIsLoading(false)
            setIngredients(initialIngridients)
            setPreferences(initialPreferences)
            setGeneratedRecipes(initialRecipes)
            setSelectedRecipeIds(initialSelectedIds)
            setStep(0)
            router.push('/Profile');
        } catch (error) {
            console.log(error)
        }
    }


    return recipeCreationData.reachedLimit ? <LimitReached
        message="You have reached the maximum number of interactions with our AI services. Please try again later."
        actionText="Go to Home"
    /> : (
        <>
            <div className="sm:mx-auto sm:w-full sm:max-w-sm flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-blue-700 bg-blue-100 rounded-lg p-3 mb-5 mt-5 shadow-md">
                    {steps[step]}
                </span>
                <p className="text-black mt-2 font-bold italic text-lg"></p>
                <div className="flex items-center justify-center">
                    <div className="w-[400px]  text-white p-4 flex justify-between mt-2">
                        <Button
                            type="button"
                            className="bg-sky-600 text-white rounded-l-md border-r border-gray-100 py-2 hover:bg-sky-500 hover:text-white px-3 data-[disabled]:bg-gray-200"
                            onClick={() => updateStep(-1)}
                            disabled={step === 0}
                        >
                            <div className="flex flex-row align-middle">
                                <svg className="w-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd"></path>
                                </svg>
                                <p className="ml-2">Prev</p>
                            </div>
                        </Button>
                        <Button
                            type="button"
                            className="bg-sky-600 text-white rounded-r-md py-2 border-l border-gray-100 hover:bg-sky-500 hover:text-white px-3 data-[disabled]:bg-gray-200"
                            onClick={() => updateStep(+1)}
                            disabled={step === steps.length - 1 || step === 2 && !generatedRecipes.length}
                        >
                            <div className="flex flex-row align-middle">
                                <span className="mr-2">Next</span>
                                <svg className="w-5 ml-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"></path>
                                </svg>
                            </div>
                        </Button>
                    </div>
                </div>
            </div>
            {
                isLoading ?
                    <Loading />
                    :
                    <StepComponent
                        step={step}
                        ingredientList={recipeCreationData.ingredientList}
                        ingredients={ingredients}
                        updateIngredients={(ingredients: Ingredient[]) => setIngredients(ingredients)}
                        preferences={preferences}
                        updatePreferences={(preferences: DietaryPreference[]) => setPreferences(preferences)}
                        editInputs={() => setStep(0)}
                        handleIngredientSubmit={handleIngredientSubmit}
                        generatedRecipes={generatedRecipes}
                        updateSelectedRecipes={(selectedIds) => setSelectedRecipeIds(selectedIds)}
                        selectedRecipes={selectedRecipeIds}
                        handleRecipeSubmit={handleRecipeSubmit}
                    />
            }

        </>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    return await getServerSidePropsUtility(context, 'api/get-ingredients', 'recipeCreationData')
};

export default Navigation;
