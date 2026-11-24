import { http, HttpResponse } from 'msw/http'
import { breakfastMenu } from './menu'

export const handlers = [
  http.get('*/api/menu', () => HttpResponse.json(breakfastMenu)),
]
