import { IsOptional, IsString, MinLength } from 'class-validator';

/** A deposit the system makes to a user's wallet. */
export class DepositDto {
  @IsString()
  @MinLength(3)
  userId!: string;

  @IsString()
  @MinLength(1)
  amount!: string;
}

/** A withdrawal the caller asks of their own wallet. */
export class WithdrawDto {
  @IsString()
  @MinLength(1)
  amount!: string;
}

/** What the order route accepts: the memo, and nothing else. */
export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  memo?: string;
}
