export interface Message {
  id: number
  text: string
  sender: 'user' | 'assistant'
}

export interface DropboxFile {
  name: string;
  path_lower: string;
  id: string;
}