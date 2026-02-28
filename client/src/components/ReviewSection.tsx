import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { recipeApi } from "../api";
import type { RecipeReview } from "../types";

type Props = {
  recipeId: string;
  reviews: RecipeReview[];
  currentUserId?: string;
  onSaved: () => Promise<void>;
  maxVisible?: number;
};

export const ReviewSection = ({
  recipeId,
  reviews,
  currentUserId,
  onSaved,
  maxVisible = 6,
}: Props) => {
  const mine = useMemo(() => reviews.find((review) => review.userId === currentUserId), [reviews, currentUserId]);
  const [rating, setRating] = useState(mine?.rating ?? 5);
  const [comment, setComment] = useState(mine?.comment ?? "");

  const average =
    reviews.length > 0
      ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
      : "-";

  const saveMutation = useMutation({
    mutationFn: () => recipeApi.addReview(recipeId, { rating, comment }),
    onSuccess: async () => {
      await onSaved();
    },
  });

  return (
    <section className="review-box" aria-label="Recipe reviews">
      <h4>
        Reviews ({reviews.length}) - Avg: {average}
      </h4>
      <div className="review-form">
        <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
          <option value={5}>5 stars</option>
          <option value={4}>4 stars</option>
          <option value={3}>3 stars</option>
          <option value={2}>2 stars</option>
          <option value={1}>1 star</option>
        </select>
        <input
          placeholder="Write your review"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          minLength={2}
        />
        <button
          className="secondary"
          onClick={() => saveMutation.mutate()}
          disabled={comment.trim().length < 2 || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : mine ? "Update review" : "Add review"}
        </button>
      </div>
      <div className="review-list">
        {reviews.slice(0, maxVisible).map((review) => (
          <article key={review.id}>
            <strong>{review.user.name}</strong>
            <p>
              {"\u2605".repeat(review.rating)}
              {"\u2606".repeat(5 - review.rating)}
            </p>
            <p>{review.comment}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
