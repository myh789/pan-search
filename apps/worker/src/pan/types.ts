export type TransferConfig = {
  url: string;
  code?: string;
  isType?: number;
  expired_type?: number;
  ad_fid?: string;
  stoken?: string;
};

export type TransferResult =
  | { code: 200; message: string; data: { title: string; share_url: string; fid?: any; code?: string; stoken?: string } }
  | { code: number; message: string; data?: null };

export interface PanAdapter {
  getFiles(pdirFid?: string | number): Promise<TransferResult>;
  transfer(pwdId: string): Promise<TransferResult>;
  deletepdirFid(filelist: string[]): Promise<TransferResult>;
}
